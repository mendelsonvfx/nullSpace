use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use base64::{Engine as _, engine::general_purpose};

/// Skip past the PSD header (26 bytes) and color mode block.
/// Assumes 4 signature bytes have already been read.
/// Returns the image resources block length on success.
fn skip_to_image_resources(file: &mut File) -> Result<u32, String> {
    // Header is 26 bytes total; 4 already read (signature) → seek to absolute byte 26
    file.seek(SeekFrom::Start(26))
        .map_err(|e| format!("Failed to seek past PSD header: {}", e))?;

    let mut buf4 = [0u8; 4];

    // Color Mode Data block: 4-byte length + data
    file.read_exact(&mut buf4)
        .map_err(|e| format!("Failed to read color mode length: {}", e))?;
    let color_mode_len = u32::from_be_bytes(buf4) as i64;
    file.seek(SeekFrom::Current(color_mode_len))
        .map_err(|e| format!("Failed to seek past color mode data: {}", e))?;

    // Image Resources block: 4-byte length field
    file.read_exact(&mut buf4)
        .map_err(|e| format!("Failed to read image resources length: {}", e))?;
    Ok(u32::from_be_bytes(buf4))
}

/// Iterate PSD Image Resources block and return the raw data bytes for resource ID 1036.
/// Tracks bytes_consumed to never read past the resources boundary.
fn find_resource_1036(file: &mut File, resources_length: u32) -> Result<Option<Vec<u8>>, String> {
    let limit = resources_length as u64;
    let mut consumed: u64 = 0;

    while consumed < limit {
        // Minimum valid resource header is 12 bytes: 4 "8BIM" + 2 id + 2 pascal + 4 data_len
        if limit - consumed < 12 {
            break;
        }

        // "8BIM" signature (4 bytes)
        let mut sig = [0u8; 4];
        file.read_exact(&mut sig)
            .map_err(|e| format!("Failed to read 8BIM signature: {}", e))?;
        consumed += 4;
        if &sig != b"8BIM" {
            break; // Corrupt data — stop safely
        }

        // Resource ID (2 bytes, big-endian)
        let mut id_buf = [0u8; 2];
        file.read_exact(&mut id_buf)
            .map_err(|e| format!("Failed to read resource ID: {}", e))?;
        consumed += 2;
        let resource_id = u16::from_be_bytes(id_buf);

        // Pascal string: 1 byte name_len + name_len bytes, padded to even total
        let mut name_len_buf = [0u8; 1];
        file.read_exact(&mut name_len_buf)
            .map_err(|e| format!("Failed to read pascal string length: {}", e))?;
        let name_len = name_len_buf[0] as u64;
        let ps_total = 1 + name_len; // includes the length byte itself
        let ps_bytes = if ps_total % 2 == 0 { ps_total } else { ps_total + 1 };
        // Skip remaining pascal string bytes (length byte already consumed)
        let ps_remaining = ps_bytes - 1;
        if ps_remaining > 0 {
            file.seek(SeekFrom::Current(ps_remaining as i64))
                .map_err(|e| format!("Failed to skip pascal string: {}", e))?;
        }
        consumed += ps_bytes;

        // Resource data length (4 bytes, big-endian)
        let mut data_len_buf = [0u8; 4];
        file.read_exact(&mut data_len_buf)
            .map_err(|e| format!("Failed to read resource data length: {}", e))?;
        consumed += 4;
        let data_length = u32::from_be_bytes(data_len_buf);

        // Data is padded to even
        let padded = data_length as u64 + (data_length as u64 % 2);

        // Bounds check: don't read past resources boundary
        if consumed + padded > limit {
            break;
        }

        if resource_id == 1036 {
            // Sanity cap: no real thumbnail exceeds 5 MB
            if data_length > 5_000_000 {
                return Ok(None);
            }
            let mut resource_data = vec![0u8; data_length as usize];
            file.read_exact(&mut resource_data)
                .map_err(|e| format!("Failed to read thumbnail resource: {}", e))?;
            return Ok(Some(resource_data));
        }

        // Skip this resource's data block
        file.seek(SeekFrom::Current(padded as i64))
            .map_err(|e| format!("Failed to seek past resource data: {}", e))?;
        consumed += padded;
    }

    Ok(None)
}

/// Validate thumbnail resource data, extract JPEG bytes, and return a data URL.
fn jpeg_resource_to_data_url(resource_data: &[u8]) -> Result<Option<String>, String> {
    // Need at least 28-byte thumbnail header + 2 JPEG magic bytes
    if resource_data.len() < 30 {
        return Ok(None);
    }

    // Format field at offset 0: big-endian u32, must be 1 (kJpegRGB)
    let format = u32::from_be_bytes([
        resource_data[0],
        resource_data[1],
        resource_data[2],
        resource_data[3],
    ]);
    if format != 1 {
        return Ok(None);
    }

    // Validate JPEG magic bytes (0xFF 0xD8) at start of JPEG data (offset 28)
    if resource_data[28] != 0xFF || resource_data[29] != 0xD8 {
        return Ok(None);
    }

    let jpeg_data = &resource_data[28..];
    let encoded = general_purpose::STANDARD.encode(jpeg_data);
    Ok(Some(format!("data:image/jpeg;base64,{}", encoded)))
}

/// Extract the embedded JPEG thumbnail from a PSD or PSB file.
/// Returns a base64-encoded data URL, or None if no thumbnail is present.
pub fn extract_psd_thumbnail(path: &str) -> Result<Option<String>, String> {
    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    // Verify "8BPS" signature
    let mut sig = [0u8; 4];
    file.read_exact(&mut sig)
        .map_err(|e| format!("Failed to read PSD signature: {}", e))?;
    if &sig != b"8BPS" {
        return Err("Not a valid PSD/PSB file".to_string());
    }

    // Seek past header and color mode block; get image resources length
    let resources_length = skip_to_image_resources(&mut file)?;

    // Find resource ID 1036 (thumbnail)
    let resource_data = match find_resource_1036(&mut file, resources_length)? {
        Some(data) => data,
        None => return Ok(None),
    };

    jpeg_resource_to_data_url(&resource_data)
}
