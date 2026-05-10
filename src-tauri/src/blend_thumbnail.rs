use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Cursor, BufReader};
use base64::{Engine as _, engine::general_purpose};
use image::{ImageBuffer, Rgba, ImageFormat};

// Zstandard magic bytes (Blender 3.0+ compression)
const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];

/// Check if data is zstd compressed
fn is_zstd_compressed(header: &[u8]) -> bool {
    header.len() >= 4 && header[0..4] == ZSTD_MAGIC
}

/// Detect blend file format from the first 12–17 bytes of the header.
/// Returns (header_size, is_64bit, is_big_endian).
///
/// Old format (Blender < 5.0): 12-byte header — byte 7 is '-' (64-bit) or '_' (32-bit).
/// New format (Blender 5.x+):  17-byte header — byte 7 is a digit; ptr at byte 9, endian at byte 12.
fn detect_blend_format(header: &[u8]) -> (usize, bool, bool) {
    if header[7] == b'-' || header[7] == b'_' {
        (12, header[7] == b'-', header[8] == b'V')
    } else {
        // New format requires at least 17 bytes
        let is_64bit = header.len() > 9 && header[9] == b'-';
        let is_big_endian = header.len() > 12 && header[12] == b'V';
        (17, is_64bit, is_big_endian)
    }
}

/// Returns (block_header_size, size_field_offset) for the given format.
///
/// Old format: 24-byte block headers (64-bit), size at offset +4.
/// New format: 32-byte block headers (64-bit), size at offset +16.
fn block_params(is_new_format: bool, is_64bit: bool) -> (usize, usize) {
    match (is_new_format, is_64bit) {
        (false, true)  => (24,  4),
        (false, false) => (20,  4),
        (true,  true)  => (32, 16),
        (true,  false) => (28, 12), // hypothetical 32-bit new format
    }
}

/// Decompress zstd-compressed .blend file data
/// Only reads enough to find the TEST block (first ~500KB should be enough)
fn decompress_zstd_partial(file: &mut File) -> Result<Vec<u8>, String> {
    file.seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to seek: {}", e))?;

    let reader = BufReader::new(file);
    let mut decoder = zstd::stream::Decoder::new(reader)
        .map_err(|e| format!("Failed to create zstd decoder: {}", e))?;

    // Read first 500KB - should be enough to find TEST block
    let mut buffer = vec![0u8; 500 * 1024];
    let bytes_read = decoder.read(&mut buffer)
        .map_err(|e| format!("Failed to decompress: {}", e))?;

    buffer.truncate(bytes_read);
    Ok(buffer)
}

/// Extract thumbnail from decompressed data buffer.
/// Handles both old (Blender < 5.0) and new (Blender 5.x+) block formats.
fn extract_thumbnail_from_buffer(data: &[u8]) -> Result<Option<String>, String> {
    if data.len() < 12 {
        return Err("Data too small".to_string());
    }

    // Verify magic bytes "BLENDER"
    if &data[0..7] != b"BLENDER" {
        return Err("Not a valid .blend file data".to_string());
    }

    let (header_size, is_64bit, is_big_endian) = detect_blend_format(data);

    if data.len() < header_size {
        return Err("Data too small for header".to_string());
    }

    let is_new_format = header_size > 12;
    let (block_header_size, size_offset) = block_params(is_new_format, is_64bit);

    let mut pos = header_size;

    // Search for TEST block
    while pos + block_header_size <= data.len() {
        let code = &data[pos..pos + 4];

        let length = if is_big_endian {
            u32::from_be_bytes([
                data[pos + size_offset],
                data[pos + size_offset + 1],
                data[pos + size_offset + 2],
                data[pos + size_offset + 3],
            ])
        } else {
            u32::from_le_bytes([
                data[pos + size_offset],
                data[pos + size_offset + 1],
                data[pos + size_offset + 2],
                data[pos + size_offset + 3],
            ])
        } as usize;

        // Check if this is the TEST block
        if code == b"TEST" {
            let block_data_start = pos + block_header_size;
            let block_data_end = block_data_start + length;

            if block_data_end > data.len() {
                return Err("TEST block extends beyond buffer".to_string());
            }

            let block_data = &data[block_data_start..block_data_end];
            return process_test_block(block_data, is_big_endian);
        }

        // Move to next block
        pos += block_header_size + length;
    }

    // No TEST block found
    Ok(None)
}

/// Process TEST block data and return base64-encoded PNG
fn process_test_block(data: &[u8], is_big_endian: bool) -> Result<Option<String>, String> {
    if data.len() < 8 {
        return Err("TEST block too small".to_string());
    }

    // Skip width and height (we don't need them, PNG has its own dimensions)
    // The actual PNG data starts at byte 8
    let png_data = &data[8..];

    // Check if it's PNG data (starts with PNG magic bytes)
    if png_data.len() > 8 && &png_data[0..8] == b"\x89PNG\r\n\x1a\n" {
        // Encode PNG data to base64
        let base64_string = general_purpose::STANDARD.encode(png_data);
        let data_url = format!("data:image/png;base64,{}", base64_string);
        return Ok(Some(data_url));
    }

    // TEST block contains RGBA data, not PNG
    // Extract width and height
    let width = if is_big_endian {
        i32::from_be_bytes([data[0], data[1], data[2], data[3]])
    } else {
        i32::from_le_bytes([data[0], data[1], data[2], data[3]])
    };

    let height = if is_big_endian {
        i32::from_be_bytes([data[4], data[5], data[6], data[7]])
    } else {
        i32::from_le_bytes([data[4], data[5], data[6], data[7]])
    };

    if width <= 0 || height <= 0 || width > 1024 || height > 1024 {
        return Err(format!("Invalid thumbnail dimensions: {}x{}", width, height));
    }

    let expected_size = 8 + (width * height * 4) as usize;
    if data.len() < expected_size {
        return Err(format!("TEST block too small for RGBA data: {} < {}", data.len(), expected_size));
    }

    // Convert RGBA to PNG
    let rgba_data = &data[8..expected_size];
    let png_bytes = rgba_to_png(rgba_data, width as u32, height as u32)?;

    // Encode PNG to base64
    let base64_string = general_purpose::STANDARD.encode(&png_bytes);
    let data_url = format!("data:image/png;base64,{}", base64_string);
    Ok(Some(data_url))
}

/// Extracts the thumbnail from a .blend file's TEST block.
/// Supports old (Blender < 5.0) and new (Blender 5.x+) file formats,
/// both uncompressed and zstd-compressed.
/// Returns base64-encoded PNG data, or None if no thumbnail exists.
pub fn extract_blend_thumbnail(path: &str) -> Result<Option<String>, String> {
    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open .blend file: {}", e))?;

    // Read first 12 bytes to check compression and detect format
    let mut header12 = [0u8; 12];
    file.read_exact(&mut header12)
        .map_err(|e| format!("Failed to read .blend header: {}", e))?;

    // Check if file is zstd compressed (Blender 3.0+)
    if is_zstd_compressed(&header12) {
        let decompressed = decompress_zstd_partial(&mut file)?;
        return extract_thumbnail_from_buffer(&decompressed);
    }

    // Verify magic bytes "BLENDER" for uncompressed files
    if &header12[0..7] != b"BLENDER" {
        return Err("Not a valid .blend file".to_string());
    }

    // Detect old vs new format, reading 5 more bytes for new format
    let is_new_format = header12[7] != b'-' && header12[7] != b'_';
    let (_, is_64bit, is_big_endian) = if is_new_format {
        let mut extra = [0u8; 5];
        file.read_exact(&mut extra)
            .map_err(|e| format!("Failed to read extended header: {}", e))?;
        let mut h17 = [0u8; 17];
        h17[..12].copy_from_slice(&header12);
        h17[12..].copy_from_slice(&extra);
        detect_blend_format(&h17)
    } else {
        detect_blend_format(&header12)
    };

    let (block_header_size, size_offset) = block_params(is_new_format, is_64bit);

    // File cursor is now at header_size (12 or 17). Scan blocks sequentially.
    loop {
        let mut block_header = vec![0u8; block_header_size];

        match file.read_exact(&mut block_header) {
            Ok(_) => {},
            Err(_) => break, // EOF reached, no TEST block found
        }

        let code = &block_header[0..4];

        let length = if is_big_endian {
            u32::from_be_bytes([
                block_header[size_offset],
                block_header[size_offset + 1],
                block_header[size_offset + 2],
                block_header[size_offset + 3],
            ])
        } else {
            u32::from_le_bytes([
                block_header[size_offset],
                block_header[size_offset + 1],
                block_header[size_offset + 2],
                block_header[size_offset + 3],
            ])
        };

        // Check if this is the TEST block
        if code == b"TEST" {
            let mut data = vec![0u8; length as usize];
            file.read_exact(&mut data)
                .map_err(|e| format!("Failed to read TEST block data: {}", e))?;

            return process_test_block(&data, is_big_endian);
        }

        // Skip to next block
        file.seek(SeekFrom::Current(length as i64))
            .map_err(|e| format!("Failed to seek in file: {}", e))?;
    }

    // No TEST block found
    Ok(None)
}

/// Convert RGBA bytes to PNG format
fn rgba_to_png(rgba_data: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    // Create image buffer from RGBA data
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(width, height, rgba_data.to_vec())
        .ok_or_else(|| "Failed to create image buffer from RGBA data".to_string())?;

    // Flip image vertically (Blender stores bottom-to-top)
    let flipped = image::imageops::flip_vertical(&img);

    // Encode to PNG
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);
    flipped.write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    Ok(png_bytes)
}
