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

/// Decompress zstd-compressed .blend file data
/// Only reads enough to find the TEST block (first ~500KB should be enough)
fn decompress_zstd_partial(file: &mut File) -> Result<Vec<u8>, String> {
    file.seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to seek: {}", e))?;
    
    let reader = BufReader::new(file);
    let mut decoder = zstd::stream::Decoder::new(reader)
        .map_err(|e| format!("Failed to create zstd decoder: {}", e))?;
    
    // Read first 500KB - should be enough to find TEST block
    // TEST block is typically near the beginning of the file
    let mut buffer = vec![0u8; 500 * 1024];
    let bytes_read = decoder.read(&mut buffer)
        .map_err(|e| format!("Failed to decompress: {}", e))?;
    
    buffer.truncate(bytes_read);
    Ok(buffer)
}

/// Extract thumbnail from decompressed data buffer
fn extract_thumbnail_from_buffer(data: &[u8]) -> Result<Option<String>, String> {
    if data.len() < 12 {
        return Err("Data too small".to_string());
    }
    
    // Verify magic bytes "BLENDER"
    if &data[0..7] != b"BLENDER" {
        return Err("Not a valid .blend file data".to_string());
    }
    
    // Parse pointer size and endianness
    let is_64bit = data[7] == b'-'; // '-' = 64-bit, '_' = 32-bit
    let is_big_endian = data[8] == b'V'; // 'V' = big-endian, 'v' = little-endian
    let block_header_size = if is_64bit { 24 } else { 20 };
    
    // Start after file header (12 bytes)
    let mut pos = 12usize;
    
    // Search for TEST block
    while pos + block_header_size <= data.len() {
        let code = &data[pos..pos + 4];
        
        // Read block data length (4 bytes at offset 4)
        let length = if is_big_endian {
            u32::from_be_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]])
        } else {
            u32::from_le_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]])
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

/// Extracts the thumbnail from a .blend file's TEST block
/// Supports both uncompressed and zstd-compressed files (Blender 3.0+)
/// Returns base64-encoded PNG data, or None if no thumbnail exists
pub fn extract_blend_thumbnail(path: &str) -> Result<Option<String>, String> {
    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open .blend file: {}", e))?;

    // Read header to check if compressed
    let mut header = [0u8; 12];
    file.read_exact(&mut header)
        .map_err(|e| format!("Failed to read .blend header: {}", e))?;

    // Check if file is zstd compressed (Blender 3.0+)
    if is_zstd_compressed(&header) {
        // Decompress and extract from buffer
        let decompressed = decompress_zstd_partial(&mut file)?;
        return extract_thumbnail_from_buffer(&decompressed);
    }

    // Verify magic bytes "BLENDER" for uncompressed files
    if &header[0..7] != b"BLENDER" {
        return Err("Not a valid .blend file".to_string());
    }

    // Parse pointer size and endianness
    let is_64bit = header[7] == b'-'; // '-' = 64-bit, '_' = 32-bit
    let is_big_endian = header[8] == b'V'; // 'V' = big-endian, 'v' = little-endian
    let block_header_size = if is_64bit { 24 } else { 20 };

    // Search for TEST block in uncompressed file
    loop {
        let mut block_header = vec![0u8; block_header_size];

        // Try to read block header
        match file.read_exact(&mut block_header) {
            Ok(_) => {},
            Err(_) => break, // EOF reached, no TEST block found
        }

        // Read block code (4 bytes)
        let code = &block_header[0..4];

        // Read block data length (4 bytes at offset 4)
        let length = if is_big_endian {
            u32::from_be_bytes([block_header[4], block_header[5], block_header[6], block_header[7]])
        } else {
            u32::from_le_bytes([block_header[4], block_header[5], block_header[6], block_header[7]])
        };

        // Check if this is the TEST block
        if code == b"TEST" {
            // Read the TEST block data
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
