//! Embedded document preview of Cinema 4D (.c4d) files.
//!
//! C4D stores the preview as a plain JPEG in the file header — at offset 45 in current files,
//! further in older ones — so we look for it in the first bytes instead of relying on an offset.

use std::fs::File;
use std::io::Read;
use base64::{Engine as _, engine::general_purpose};
use image::ImageFormat;

const C4D_MAGIC: &[u8] = b"QC4DC4D";
const PNG_SIGNATURE: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
const JPEG_SOI: &[u8] = &[0xFF, 0xD8, 0xFF];

/// The preview sits in the header; JPEG textures embedded deeper in big scenes must not be picked up
const SEARCH_WINDOW: usize = 64 * 1024;
/// Typical preview (offset 45 + ~75 KB) fits here, so most files need a single small read
const INITIAL_READ: u64 = 256 * 1024;
/// Upper bound when the preview end lies beyond the initial read (scenes can be hundreds of MB)
const MAX_READ: u64 = 4 * 1024 * 1024;

enum Scan {
    Found { mime: &'static str, format: ImageFormat, start: usize, end: usize },
    /// Preview start found but its end lies beyond the bytes read (or the data is malformed)
    Incomplete,
    Missing,
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// End of a JPEG (index after EOI) found by walking its markers.
/// A plain search for FF D9 is not enough: that byte pair can occur inside DHT tables.
fn jpeg_end(data: &[u8], start: usize) -> Option<usize> {
    let len = data.len();
    let mut i = start + 2; // after SOI
    loop {
        if i + 1 >= len || data[i] != 0xFF {
            return None;
        }
        // Skip fill bytes
        while data[i + 1] == 0xFF {
            i += 1;
            if i + 1 >= len {
                return None;
            }
        }
        let marker = data[i + 1];
        match marker {
            0xD9 => return Some(i + 2),
            // Markers without a length field
            0x01 | 0xD0..=0xD8 => i += 2,
            _ => {
                if i + 3 >= len {
                    return None;
                }
                let segment_len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
                if segment_len < 2 {
                    return None;
                }
                i += 2 + segment_len;
                if marker == 0xDA {
                    // Entropy-coded data runs until the next real marker:
                    // FF 00 is a stuffed byte and FF D0..D7 are restart markers
                    loop {
                        if i + 1 >= len {
                            return None;
                        }
                        if data[i] == 0xFF {
                            let next = data[i + 1];
                            if next == 0x00 || (0xD0..=0xD7).contains(&next) {
                                i += 2;
                                continue;
                            }
                            break;
                        }
                        i += 1;
                    }
                }
            }
        }
    }
}

/// End of a PNG (index after the IEND chunk) found by walking its chunks
fn png_end(data: &[u8], start: usize) -> Option<usize> {
    let mut i = start + PNG_SIGNATURE.len();
    loop {
        let header = data.get(i..i + 8)?;
        let chunk_len = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as usize;
        // length + type + data + CRC
        let next = i.checked_add(12)?.checked_add(chunk_len)?;
        if next > data.len() {
            return None;
        }
        if &header[4..8] == b"IEND" {
            return Some(next);
        }
        i = next;
    }
}

fn scan_preview(data: &[u8]) -> Scan {
    let window = &data[..data.len().min(SEARCH_WINDOW)];

    if let Some(start) = find(window, JPEG_SOI) {
        return match jpeg_end(data, start) {
            Some(end) => Scan::Found { mime: "image/jpeg", format: ImageFormat::Jpeg, start, end },
            None => Scan::Incomplete,
        };
    }
    // Not seen in real files so far — kept so a future format change doesn't silently drop previews
    if let Some(start) = find(window, PNG_SIGNATURE) {
        return match png_end(data, start) {
            Some(end) => Scan::Found { mime: "image/png", format: ImageFormat::Png, start, end },
            None => Scan::Incomplete,
        };
    }
    Scan::Missing
}

/// Extract the document preview embedded in a .c4d file.
/// Returns a base64 data URL, or None if the file has no (valid) preview —
/// e.g. files saved headless by c4dpy, which can't render a viewport.
pub fn extract_c4d_thumbnail(path: &str) -> Result<Option<String>, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    let mut data = Vec::new();
    (&mut file).take(INITIAL_READ).read_to_end(&mut data)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    if !data.starts_with(C4D_MAGIC) {
        return Ok(None);
    }

    let mut scan = scan_preview(&data);
    // Read further only when the preview start was found but its end is beyond the first chunk
    if matches!(scan, Scan::Incomplete) && data.len() as u64 == INITIAL_READ {
        (&mut file).take(MAX_READ - INITIAL_READ).read_to_end(&mut data)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        scan = scan_preview(&data);
    }

    let Scan::Found { mime, format, start, end } = scan else {
        return Ok(None);
    };
    let image_bytes = &data[start..end];

    // A broken or truncated image would show up as a broken picture in the UI
    if image::load_from_memory_with_format(image_bytes, format).is_err() {
        return Ok(None);
    }

    let encoded = general_purpose::STANDARD.encode(image_bytes);
    Ok(Some(format!("data:{};base64,{}", mime, encoded)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageOutputFormat, RgbImage};
    use std::io::Cursor;
    use std::path::PathBuf;

    fn encode(width: u32, height: u32, noisy: bool, format: ImageOutputFormat) -> Vec<u8> {
        let mut seed: u32 = 12345;
        let img = RgbImage::from_fn(width, height, |x, y| {
            if noisy {
                // Noise compresses poorly — used to get a large JPEG
                seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                let v = (seed >> 16) as u8;
                image::Rgb([v, v.wrapping_add(85), v.wrapping_add(170)])
            } else {
                image::Rgb([(x % 256) as u8, (y % 256) as u8, 128])
            }
        });
        let mut bytes = Vec::new();
        DynamicImage::ImageRgb8(img).write_to(&mut Cursor::new(&mut bytes), format).unwrap();
        bytes
    }

    fn jpeg(width: u32, height: u32) -> Vec<u8> {
        encode(width, height, false, ImageOutputFormat::Jpeg(85))
    }

    /// C4D-like file: magic, padding up to `offset`, image, then scene data
    fn write_c4d(name: &str, offset: usize, image: &[u8]) -> PathBuf {
        let mut data = b"QC4DC4D6".to_vec();
        data.resize(offset, 0);
        data.extend_from_slice(image);
        data.extend(std::iter::repeat(0x42).take(4096));
        let path = std::env::temp_dir().join(format!("rayhub_c4d_{}_{}.c4d", name, std::process::id()));
        std::fs::write(&path, data).unwrap();
        path
    }

    fn extract(path: &PathBuf) -> Option<String> {
        let result = extract_c4d_thumbnail(path.to_str().unwrap()).unwrap();
        let _ = std::fs::remove_file(path);
        result
    }

    #[test]
    fn finds_preview_in_current_header() {
        let path = write_c4d("current", 45, &jpeg(500, 301));
        assert!(extract(&path).unwrap().starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn finds_preview_in_older_header() {
        let path = write_c4d("older", 2602, &jpeg(90, 90));
        assert!(extract(&path).is_some());
    }

    #[test]
    fn ignores_jpeg_beyond_search_window() {
        let path = write_c4d("deep", 70 * 1024, &jpeg(64, 64));
        assert!(extract(&path).is_none());
    }

    #[test]
    fn file_without_preview_returns_none() {
        // Like files saved headless by c4dpy
        let path = write_c4d("nopreview", 45, &[]);
        assert!(extract(&path).is_none());
    }

    #[test]
    fn reads_further_when_preview_ends_beyond_first_chunk() {
        let big = encode(700, 700, true, ImageOutputFormat::Jpeg(100));
        assert!(big.len() as u64 > INITIAL_READ, "test image must exceed the initial read");
        let path = write_c4d("big", 45, &big);
        assert!(extract(&path).is_some());
    }

    #[test]
    fn finds_png_preview() {
        let png = encode(64, 64, false, ImageOutputFormat::Png);
        let path = write_c4d("png", 45, &png);
        assert!(extract(&path).unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn non_c4d_file_returns_none() {
        let mut data = b"NOTAC4DFILE".to_vec();
        data.extend_from_slice(&jpeg(64, 64));
        let path = std::env::temp_dir().join(format!("rayhub_c4d_notc4d_{}.c4d", std::process::id()));
        std::fs::write(&path, data).unwrap();
        assert!(extract(&path).is_none());
    }

    /// Manual check against real files:
    /// RAYHUB_C4D_SAMPLES="a.c4d;b.c4d" cargo test real_c4d_samples -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_c4d_samples() {
        let samples = std::env::var("RAYHUB_C4D_SAMPLES").expect("set RAYHUB_C4D_SAMPLES");
        for path in samples.split(';').filter(|p| !p.is_empty()) {
            let result = extract_c4d_thumbnail(path).unwrap();
            println!("{} -> {}", path, result.as_ref().map_or("no preview".to_string(), |s| format!("{} chars, {}", s.len(), &s[..30])));
        }
    }

    #[test]
    fn truncated_jpeg_returns_none() {
        let full = jpeg(200, 200);
        let path = write_c4d("truncated", 45, &full[..full.len() / 2]);
        assert!(extract(&path).is_none());
    }
}
