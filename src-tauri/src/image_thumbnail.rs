//! Small thumbnails of image files for Project Structure: png, jpg, gif, bmp, tga, tiff, hdr, exr, webp,
//! psd/psb. One thumbnail (up to 256 px) serves both the tree row and the hover preview.
//!
//! Safety first, because release builds abort on panic and a failed allocation aborts in any build:
//! - every size comes from the header and is checked before anything is decoded;
//! - EXR pixels are averaged straight into a thumbnail-sized buffer, never a full frame;
//! - WebP isn't decoded here at all (image 0.24's decoder is old and can panic on bad data):
//!   a small file is handed to WebView as is;
//! - decoding runs on two dedicated worker threads, so a folder of images never runs more than two
//!   decodes at once, and none on the async runtime.

use std::fs::File;
use std::io::{BufReader, Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, OnceLock};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, ImageOutputFormat};
use parking_lot::Mutex;
use serde::Serialize;

/// Thumbnail side, px
const THUMB_SIDE: u32 = 256;
/// Larger files aren't read at all
const MAX_FILE_BYTES: u64 = 400 * 1024 * 1024;
/// Largest image accepted, by side and by pixel count (checked from the header, before decoding)
const MAX_SIDE: u32 = 16_384;
const MAX_PIXELS: u64 = 64 * 1024 * 1024;
/// Decoder memory cap for formats read through image::io::Reader
const MAX_DECODE_ALLOC: u64 = 256 * 1024 * 1024;
/// WebP is passed to WebView unchanged, so only small ones
const MAX_WEBP_BYTES: u64 = 4 * 1024 * 1024;
const WORKERS: usize = 2;

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct ImageThumb {
    /// data:image/jpeg|png|webp;base64,...
    pub data_url: String,
    /// Size of the source image
    pub width: u32,
    pub height: u32,
    /// File size, bytes
    pub size: u64,
}

type Reply = tauri::async_runtime::Sender<Result<Option<ImageThumb>, String>>;

struct Job {
    path: PathBuf,
    reply: Reply,
}

fn queue() -> &'static mpsc::Sender<Job> {
    static QUEUE: OnceLock<mpsc::Sender<Job>> = OnceLock::new();
    QUEUE.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        let rx = Arc::new(Mutex::new(rx));
        for i in 0..WORKERS {
            let rx = rx.clone();
            let spawned = std::thread::Builder::new().name(format!("image-thumb-{}", i)).spawn(move || loop {
                let job = match rx.lock().recv() {
                    Ok(job) => job,
                    Err(_) => break,
                };
                // Release aborts on panic anyway; in dev this keeps the worker alive
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| thumbnail_for(&job.path)))
                    .unwrap_or(Ok(None));
                let _ = job.reply.try_send(result);
            });
            if let Err(e) = spawned {
                println!("[ImageThumb] Worker not started: {}", e);
            }
        }
        tx
    })
}

/// Thumbnail of an image file: None when the format isn't supported or the file can't be read
/// (the tree then keeps the file type icon).
#[tauri::command]
pub async fn get_image_thumbnail(path: String) -> Result<Option<ImageThumb>, String> {
    let path = crate::file_drag::normalize_drag_path(&path)?;
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    queue()
        .send(Job { path, reply: tx })
        .map_err(|_| "Thumbnail workers aren't running".to_string())?;
    rx.recv().await.unwrap_or(Ok(None))
}

/// Blocking: decode and shrink one file
pub fn thumbnail_for(path: &Path) -> Result<Option<ImageThumb>, String> {
    let size = match std::fs::metadata(path) {
        Ok(meta) if meta.is_file() => meta.len(),
        _ => return Ok(None),
    };
    if size == 0 || size > MAX_FILE_BYTES {
        return Ok(None);
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();

    #[cfg(debug_assertions)]
    let started = std::time::Instant::now();

    let result = match ext.as_str() {
        "jpg" | "jpeg" => jpeg(path),
        "png" | "gif" | "bmp" | "tga" | "tif" | "tiff" | "hdr" => generic(path),
        "exr" => exr_thumb::thumbnail(path),
        "webp" => return webp(path, size),
        "psd" | "psb" => return psd(path, size),
        _ => return Ok(None),
    };

    #[cfg(debug_assertions)]
    println!("[ImageThumb] {} in {}ms: {}", path.display(), started.elapsed().as_millis(),
        match &result { Ok(_) => "ok".to_string(), Err(e) => e.clone() });

    // A file being written, locked by a renderer or corrupt: no thumbnail, not an error
    let Ok((image, width, height)) = result else { return Ok(None) };
    Ok(encode(&image).map(|data_url| ImageThumb { data_url, width, height, size }))
}

fn dimensions_ok(width: u32, height: u32) -> bool {
    width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE
        && (width as u64) * (height as u64) <= MAX_PIXELS
}

/// Shrink to fit THUMB_SIDE; smaller images stay as they are
fn shrink(image: DynamicImage) -> DynamicImage {
    if image.width() > THUMB_SIDE || image.height() > THUMB_SIDE {
        image.thumbnail(THUMB_SIDE, THUMB_SIDE)
    } else {
        image
    }
}

/// JPEG decodes straight at a reduced scale (1/2..1/8): a 4K photo takes milliseconds.
/// image's Limits don't apply to a decoder used directly, so the header is checked here
fn jpeg(path: &Path) -> Result<(DynamicImage, u32, u32), String> {
    use image::codecs::jpeg::JpegDecoder;
    use image::ImageDecoder;

    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut decoder = JpegDecoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;
    let (width, height) = decoder.dimensions();
    if !dimensions_ok(width, height) {
        return Err(format!("too large: {}x{}", width, height));
    }
    decoder.scale(THUMB_SIDE as u16, THUMB_SIDE as u16).map_err(|e| e.to_string())?;
    let image = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    Ok((shrink(image), width, height))
}

/// Formats image reads with its Limits: the size is checked against them before decoding
fn generic(path: &Path) -> Result<(DynamicImage, u32, u32), String> {
    let mut limits = image::io::Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);

    let mut reader = image::io::Reader::open(path).map_err(|e| e.to_string())?;
    reader.limits(limits);
    let image = reader.decode().map_err(|e| e.to_string())?;
    let (width, height) = (image.width(), image.height());
    if !dimensions_ok(width, height) {
        return Err(format!("too large: {}x{}", width, height));
    }
    Ok((shrink(image), width, height))
}

/// JPEG when fully opaque (smaller), PNG when anything is transparent
fn encode(image: &DynamicImage) -> Option<String> {
    let rgba = image.to_rgba8();
    let transparent = rgba.pixels().any(|p| p.0[3] < 255);
    let mut bytes = Cursor::new(Vec::new());
    let mime = if transparent {
        DynamicImage::ImageRgba8(rgba).write_to(&mut bytes, ImageOutputFormat::Png).ok()?;
        "image/png"
    } else {
        DynamicImage::ImageRgb8(image.to_rgb8()).write_to(&mut bytes, ImageOutputFormat::Jpeg(82)).ok()?;
        "image/jpeg"
    };
    Some(format!("data:{};base64,{}", mime, STANDARD.encode(bytes.into_inner())))
}

/// Read the first `n` bytes (fewer if the file is shorter)
fn read_head(path: &Path, n: usize) -> Option<Vec<u8>> {
    let mut head = Vec::with_capacity(n);
    File::open(path).ok()?.take(n as u64).read_to_end(&mut head).ok()?;
    Some(head)
}

/// Width and height from a WebP header (VP8, VP8L or VP8X), without decoding
fn webp_dimensions(head: &[u8]) -> Option<(u32, u32)> {
    if head.len() < 30 || &head[0..4] != b"RIFF" || &head[8..12] != b"WEBP" {
        return None;
    }
    let u24 = |i: usize| head[i] as u32 | (head[i + 1] as u32) << 8 | (head[i + 2] as u32) << 16;
    match &head[12..16] {
        // Extended: canvas size minus one, 24 bits each
        b"VP8X" => Some((u24(24) + 1, u24(27) + 1)),
        // Lossy: key frame start code, then 14-bit sizes
        b"VP8 " => {
            if head[23..26] != [0x9d, 0x01, 0x2a] {
                return None;
            }
            let w = u16::from_le_bytes([head[26], head[27]]) as u32 & 0x3fff;
            let h = u16::from_le_bytes([head[28], head[29]]) as u32 & 0x3fff;
            Some((w, h))
        }
        // Lossless: signature, then 14-bit sizes minus one
        b"VP8L" => {
            if head[20] != 0x2f {
                return None;
            }
            let bits = u32::from_le_bytes([head[21], head[22], head[23], head[24]]);
            Some(((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1))
        }
        _ => None,
    }
}

/// WebP: WebView draws it; small files only, since the whole file goes to the page
fn webp(path: &Path, size: u64) -> Result<Option<ImageThumb>, String> {
    if size > MAX_WEBP_BYTES {
        return Ok(None);
    }
    let Some((width, height)) = read_head(path, 30).as_deref().and_then(webp_dimensions) else { return Ok(None) };
    if !dimensions_ok(width, height) {
        return Ok(None);
    }
    let Ok(bytes) = std::fs::read(path) else { return Ok(None) };
    Ok(Some(ImageThumb {
        data_url: format!("data:image/webp;base64,{}", STANDARD.encode(bytes)),
        width,
        height,
        size,
    }))
}

/// Document size from a PSD/PSB header ("8BPS", then height and width, big-endian, at bytes 14 and 18)
fn psd_dimensions(head: &[u8]) -> Option<(u32, u32)> {
    if head.len() < 22 || &head[0..4] != b"8BPS" {
        return None;
    }
    let height = u32::from_be_bytes([head[14], head[15], head[16], head[17]]);
    let width = u32::from_be_bytes([head[18], head[19], head[20], head[21]]);
    Some((width, height))
}

/// PSD/PSB: the preview Photoshop embeds (already small), no decoding
fn psd(path: &Path, size: u64) -> Result<Option<ImageThumb>, String> {
    let Some((width, height)) = read_head(path, 22).as_deref().and_then(psd_dimensions) else { return Ok(None) };
    let Some(path_str) = path.to_str() else { return Ok(None) };
    let data_url = match crate::psd_thumbnail::extract_psd_thumbnail(path_str) {
        Ok(Some(url)) => url,
        _ => return Ok(None),
    };
    Ok(Some(ImageThumb { data_url, width, height, size }))
}

/// Linear light (EXR, HDR) to display sRGB
fn linear_to_srgb(v: f32) -> f32 {
    let v = if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 };
    if v <= 0.003_130_8 { v * 12.92 } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 }
}

mod exr_thumb {
    use super::*;
    use exr::prelude::*;

    /// Pixels averaged into a thumbnail-sized grid while the file is read:
    /// memory doesn't depend on the frame size
    pub(super) struct Accumulator {
        width: usize,
        height: usize,
        thumb_w: usize,
        thumb_h: usize,
        sum: Vec<[f32; 4]>,
        count: Vec<u32>,
    }

    impl Accumulator {
        pub(super) fn new(width: usize, height: usize) -> Self {
            let (thumb_w, thumb_h) = fit(width, height, THUMB_SIDE as usize);
            Accumulator { width, height, thumb_w, thumb_h, sum: vec![[0.0; 4]; thumb_w * thumb_h], count: vec![0; thumb_w * thumb_h] }
        }

        pub(super) fn add(&mut self, x: usize, y: usize, px: [f32; 4]) {
            if self.width == 0 || self.height == 0 {
                return;
            }
            let tx = x * self.thumb_w / self.width;
            let ty = y * self.thumb_h / self.height;
            let i = ty * self.thumb_w + tx;
            if let (Some(sum), Some(count)) = (self.sum.get_mut(i), self.count.get_mut(i)) {
                for (s, v) in sum.iter_mut().zip(px) {
                    *s += if v.is_finite() { v } else { 0.0 };
                }
                *count += 1;
            }
        }

        /// EXR color is premultiplied by alpha: unpremultiply, then to sRGB
        pub(super) fn finish(self) -> Option<DynamicImage> {
            let mut out = image::RgbaImage::new(self.thumb_w as u32, self.thumb_h as u32);
            for (i, pixel) in out.pixels_mut().enumerate() {
                let (Some(sum), Some(&count)) = (self.sum.get(i), self.count.get(i)) else { continue };
                if count == 0 {
                    continue;
                }
                let n = count as f32;
                let alpha = (sum[3] / n).clamp(0.0, 1.0);
                let unpremultiply = if alpha > 1e-4 { 1.0 / alpha } else { 0.0 };
                let channel = |c: f32| (linear_to_srgb(c / n * unpremultiply) * 255.0 + 0.5) as u8;
                pixel.0 = [channel(sum[0]), channel(sum[1]), channel(sum[2]), (alpha * 255.0 + 0.5) as u8];
            }
            (self.thumb_w > 0 && self.thumb_h > 0).then(|| DynamicImage::ImageRgba8(out))
        }
    }

    /// Fit `width`×`height` into `max`×`max`, keeping proportions (at least 1 px)
    pub(super) fn fit(width: usize, height: usize, max: usize) -> (usize, usize) {
        if width == 0 || height == 0 {
            return (0, 0);
        }
        if width <= max && height <= max {
            return (width, height);
        }
        if width >= height {
            (max, (height * max / width).max(1))
        } else {
            ((width * max / height).max(1), max)
        }
    }

    /// Which channels make the picture
    enum Pick {
        /// R, G, B (+ A), with the file's own names: plain "R" or a layer like "ViewLayer.Combined.R"
        Color { r: Text, g: Text, b: Text, a: Option<Text> },
        /// Luminance only
        Gray(Text),
    }

    fn pick_channels(meta: &MetaData) -> Option<Pick> {
        for header in meta.headers.iter() {
            if header.deep {
                continue;
            }
            let names: Vec<(String, &Text)> = header.channels.list.iter()
                .filter(|c| c.sampling == Vec2(1, 1))
                .map(|c| (c.name.to_string(), &c.name))
                .collect();
            let find = |name: &str| names.iter().find(|(n, _)| n == name).map(|(_, t)| (*t).clone());

            // Layer prefixes that have all of R, G, B: "" for plain channels, "Layer." for named ones
            let mut prefixes: Vec<String> = names.iter()
                .filter_map(|(n, _)| n.strip_suffix('R').filter(|p| p.is_empty() || p.ends_with('.')).map(str::to_string))
                .filter(|p| find(&format!("{p}G")).is_some() && find(&format!("{p}B")).is_some())
                .collect();
            // Prefer the plain image, then the main render pass
            let rank = |p: &String| {
                let lower = p.to_ascii_lowercase();
                if p.is_empty() { 0 } else if lower.contains("combined") { 1 } else if lower.contains("beauty") { 2 } else if lower.contains("rgba") { 3 } else { 4 }
            };
            prefixes.sort_by_key(rank);
            if let Some(p) = prefixes.first() {
                if let (Some(r), Some(g), Some(b)) = (find(&format!("{p}R")), find(&format!("{p}G")), find(&format!("{p}B"))) {
                    return Some(Pick::Color { r, g, b, a: find(&format!("{p}A")) });
                }
            }
            if let Some(y) = find("Y") {
                return Some(Pick::Gray(y));
            }
        }
        None
    }

    pub(super) fn thumbnail(path: &Path) -> std::result::Result<(DynamicImage, u32, u32), String> {
        // Header first: size and channel layout are checked before any pixel buffer exists
        let meta = MetaData::read_from_file(path, false).map_err(|e| e.to_string())?;
        let header = meta.headers.iter().find(|h| !h.deep).ok_or("deep data only")?;
        let (width, height) = (header.layer_size.width(), header.layer_size.height());
        let (w32, h32) = (u32::try_from(width).unwrap_or(u32::MAX), u32::try_from(height).unwrap_or(u32::MAX));
        if !dimensions_ok(w32, h32) {
            return Err(format!("too large: {}x{}", width, height));
        }
        let pick = pick_channels(&meta).ok_or("no RGB or Y channels")?;

        let reader = read().no_deep_data().largest_resolution_level().specific_channels();
        let accumulator = match pick {
            Pick::Color { r, g, b, a: Some(a) } => reader
                .required(r).required(g).required(b).required(a)
                .collect_pixels(
                    |size, _| Accumulator::new(size.width(), size.height()),
                    |acc: &mut Accumulator, pos, (r, g, b, a): (f32, f32, f32, f32)| acc.add(pos.x(), pos.y(), [r, g, b, a]),
                )
                .first_valid_layer().all_attributes().non_parallel()
                .from_file(path).map_err(|e| e.to_string())?
                .layer_data.channel_data.pixels,
            Pick::Color { r, g, b, a: None } => reader
                .required(r).required(g).required(b)
                .collect_pixels(
                    |size, _| Accumulator::new(size.width(), size.height()),
                    |acc: &mut Accumulator, pos, (r, g, b): (f32, f32, f32)| acc.add(pos.x(), pos.y(), [r, g, b, 1.0]),
                )
                .first_valid_layer().all_attributes().non_parallel()
                .from_file(path).map_err(|e| e.to_string())?
                .layer_data.channel_data.pixels,
            Pick::Gray(y) => reader
                .required(y)
                .collect_pixels(
                    |size, _| Accumulator::new(size.width(), size.height()),
                    |acc: &mut Accumulator, pos, (y,): (f32,)| acc.add(pos.x(), pos.y(), [y, y, y, 1.0]),
                )
                .first_valid_layer().all_attributes().non_parallel()
                .from_file(path).map_err(|e| e.to_string())?
                .layer_data.channel_data.pixels,
        };
        let image = accumulator.finish().ok_or("empty image")?;
        Ok((image, w32, h32))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nullspace_thumb_test_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn gradient(width: u32, height: u32, alpha: bool) -> DynamicImage {
        let img = image::RgbaImage::from_fn(width, height, |x, y| {
            image::Rgba([(x % 256) as u8, (y % 256) as u8, 128, if alpha && x < width / 2 { 0 } else { 255 }])
        });
        DynamicImage::ImageRgba8(img)
    }

    fn assert_thumb(thumb: &ImageThumb, width: u32, height: u32, mime: &str) {
        assert_eq!((thumb.width, thumb.height), (width, height));
        assert!(thumb.data_url.starts_with(&format!("data:{};base64,", mime)), "{}", &thumb.data_url[..40]);
        let b64 = thumb.data_url.split(',').nth(1).unwrap();
        let decoded = image::load_from_memory(&STANDARD.decode(b64).unwrap()).unwrap();
        assert!(decoded.width() <= THUMB_SIDE && decoded.height() <= THUMB_SIDE);
        // Proportions kept (within rounding)
        let source = width as f32 / height as f32;
        let thumb_ratio = decoded.width() as f32 / decoded.height() as f32;
        assert!((source - thumb_ratio).abs() < 0.05, "ratio {} vs {}", source, thumb_ratio);
    }

    #[test]
    fn raster_formats() {
        let dir = temp_dir("raster");
        let cases: [(&str, ImageOutputFormat, bool, &str); 5] = [
            ("a.png", ImageOutputFormat::Png, true, "image/png"),
            ("b.jpg", ImageOutputFormat::Jpeg(90), false, "image/jpeg"),
            ("c.tga", ImageOutputFormat::Tga, false, "image/jpeg"),
            ("d.bmp", ImageOutputFormat::Bmp, false, "image/jpeg"),
            ("e.gif", ImageOutputFormat::Gif, false, "image/jpeg"),
        ];
        for (name, format, alpha, mime) in cases {
            let path = dir.join(name);
            let img = gradient(1200, 600, alpha);
            let img = if alpha { img } else { DynamicImage::ImageRgb8(img.to_rgb8()) };
            img.write_to(&mut std::fs::File::create(&path).unwrap(), format).unwrap();
            let thumb = thumbnail_for(&path).unwrap().unwrap_or_else(|| panic!("no thumbnail for {}", name));
            assert_thumb(&thumb, 1200, 600, mime);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn small_image_isnt_enlarged() {
        let dir = temp_dir("small");
        let path = dir.join("icon.png");
        DynamicImage::ImageRgb8(gradient(40, 20, false).to_rgb8()).save(&path).unwrap();
        let thumb = thumbnail_for(&path).unwrap().unwrap();
        let b64 = thumb.data_url.split(',').nth(1).unwrap();
        let decoded = image::load_from_memory(&STANDARD.decode(b64).unwrap()).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (40, 20));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn broken_and_unsupported_files_give_none() {
        let dir = temp_dir("broken");
        // Truncated PNG (render still being written)
        let full = dir.join("full.png");
        gradient(800, 800, false).save(&full).unwrap();
        let bytes = std::fs::read(&full).unwrap();
        let cut = dir.join("cut.png");
        std::fs::write(&cut, &bytes[..bytes.len() / 3]).unwrap();
        assert_eq!(thumbnail_for(&cut).unwrap(), None);
        // PNG header claiming 100000 x 100000 pixels
        let mut huge = bytes.clone();
        huge[16..20].copy_from_slice(&100_000u32.to_be_bytes());
        huge[20..24].copy_from_slice(&100_000u32.to_be_bytes());
        let huge_path = dir.join("huge.png");
        std::fs::write(&huge_path, &huge).unwrap();
        assert_eq!(thumbnail_for(&huge_path).unwrap(), None);
        // Garbage with an image extension, an unsupported format, an empty file, a missing file
        let garbage = dir.join("garbage.jpg");
        std::fs::write(&garbage, b"not a jpeg at all").unwrap();
        assert_eq!(thumbnail_for(&garbage).unwrap(), None);
        let txt = dir.join("notes.txt");
        std::fs::write(&txt, b"hello").unwrap();
        assert_eq!(thumbnail_for(&txt).unwrap(), None);
        let empty = dir.join("empty.png");
        std::fs::write(&empty, b"").unwrap();
        assert_eq!(thumbnail_for(&empty).unwrap(), None);
        assert_eq!(thumbnail_for(&dir.join("missing.png")).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn hdr_is_tone_mapped() {
        let dir = temp_dir("hdr");
        let path = dir.join("sky.hdr");
        let pixels: Vec<image::Rgb<f32>> = (0..64 * 32).map(|i| image::Rgb([(i % 64) as f32 / 16.0, 0.5, 0.25])).collect();
        let file = std::fs::File::create(&path).unwrap();
        image::codecs::hdr::HdrEncoder::new(file).encode(&pixels, 64, 32).unwrap();
        let thumb = thumbnail_for(&path).unwrap().unwrap();
        assert_thumb(&thumb, 64, 32, "image/jpeg");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn exr_rgba_layers_and_luminance() {
        use exr::prelude::*;
        let dir = temp_dir("exr");

        // Plain RGBA, with a transparent half
        let rgba = dir.join("plain.exr");
        write_rgba_file(&rgba, 1000, 500, |x, _y| (0.5_f32, 0.25_f32, 1.0_f32, if x < 500 { 0.0_f32 } else { 1.0 })).unwrap();
        let thumb = thumbnail_for(&rgba).unwrap().unwrap();
        assert_thumb(&thumb, 1000, 500, "image/png");

        // Blender-style named layer: ViewLayer.Combined.R/G/B/A next to a data pass
        let layered = dir.join("blender.exr");
        let channels = SpecificChannels::build()
            .with_channel("Depth.Z")
            .with_channel("ViewLayer.Combined.A")
            .with_channel("ViewLayer.Combined.B")
            .with_channel("ViewLayer.Combined.G")
            .with_channel("ViewLayer.Combined.R")
            .with_pixel_fn(|_pos| (10.0_f32, 1.0_f32, 0.2_f32, 0.6_f32, 0.9_f32));
        Image::from_channels((640, 360), channels).write().to_file(&layered).unwrap();
        let thumb = thumbnail_for(&layered).unwrap().unwrap();
        assert_thumb(&thumb, 640, 360, "image/jpeg");
        // Color came from the Combined pass (reddish), not from Depth
        let b64 = thumb.data_url.split(',').nth(1).unwrap();
        let decoded = image::load_from_memory(&STANDARD.decode(b64).unwrap()).unwrap().to_rgb8();
        let p = decoded.get_pixel(10, 10).0;
        assert!(p[0] > p[2], "expected red > blue, got {:?}", p);

        // Luminance only
        let gray = dir.join("gray.exr");
        let channels = SpecificChannels::build().with_channel("Y").with_pixel_fn(|_pos| (0.18_f32,));
        Image::from_channels((300, 300), channels).write().to_file(&gray).unwrap();
        let thumb = thumbnail_for(&gray).unwrap().unwrap();
        assert_thumb(&thumb, 300, 300, "image/jpeg");

        // Truncated EXR
        let bytes = std::fs::read(&rgba).unwrap();
        let cut = dir.join("cut.exr");
        std::fs::write(&cut, &bytes[..bytes.len() / 2]).unwrap();
        assert_eq!(thumbnail_for(&cut).unwrap(), None);

        // Only a data pass, no color: no thumbnail
        let data = dir.join("depth.exr");
        let channels = SpecificChannels::build().with_channel("Z").with_pixel_fn(|_pos| (5.0_f32,));
        Image::from_channels((64, 64), channels).write().to_file(&data).unwrap();
        assert_eq!(thumbnail_for(&data).unwrap(), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn webp_sizes_from_header() {
        // VP8X: canvas 1920x1080 (stored minus one, 24 bits)
        let mut vp8x = vec![0u8; 30];
        vp8x[0..4].copy_from_slice(b"RIFF");
        vp8x[8..12].copy_from_slice(b"WEBP");
        vp8x[12..16].copy_from_slice(b"VP8X");
        vp8x[24..27].copy_from_slice(&[(1919 & 0xff) as u8, (1919 >> 8) as u8, 0]);
        vp8x[27..30].copy_from_slice(&[(1079 & 0xff) as u8, (1079 >> 8) as u8, 0]);
        assert_eq!(webp_dimensions(&vp8x), Some((1920, 1080)));
        // VP8 (lossy): 800x600 after the start code
        let mut vp8 = vp8x.clone();
        vp8[12..16].copy_from_slice(b"VP8 ");
        vp8[23..26].copy_from_slice(&[0x9d, 0x01, 0x2a]);
        vp8[26..28].copy_from_slice(&800u16.to_le_bytes());
        vp8[28..30].copy_from_slice(&600u16.to_le_bytes());
        assert_eq!(webp_dimensions(&vp8), Some((800, 600)));
        // VP8L (lossless): 640x480, 14 bits each minus one
        let mut vp8l = vp8x.clone();
        vp8l[12..16].copy_from_slice(b"VP8L");
        vp8l[20] = 0x2f;
        let bits: u32 = 639 | (479 << 14);
        vp8l[21..25].copy_from_slice(&bits.to_le_bytes());
        assert_eq!(webp_dimensions(&vp8l), Some((640, 480)));
        // Not WebP / too short
        assert_eq!(webp_dimensions(b"RIFF....WAVE"), None);
        assert_eq!(webp_dimensions(&vp8x[..20]), None);
    }

    /// Timing of 4K files; run with `cargo test --release image_thumbnail -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn timing_4k() {
        use exr::prelude::*;
        let dir = temp_dir("timing");
        let (w, h) = (3840u32, 2160u32);
        let img = DynamicImage::ImageRgb8(image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x ^ y) % 256) as u8])));
        let png = dir.join("4k.png");
        img.save(&png).unwrap();
        let jpg = dir.join("4k.jpg");
        img.write_to(&mut std::fs::File::create(&jpg).unwrap(), ImageOutputFormat::Jpeg(90)).unwrap();
        let exr_path = dir.join("4k.exr");
        write_rgba_file(&exr_path, w as usize, h as usize, |x, y| ((x % 256) as f32 / 255.0, (y % 256) as f32 / 255.0, 0.5_f32, 1.0_f32)).unwrap();
        for path in [&png, &jpg, &exr_path] {
            let started = std::time::Instant::now();
            let thumb = thumbnail_for(path).unwrap().unwrap();
            println!("{}: {} ms, {} KB data URL", path.file_name().unwrap().to_string_lossy(), started.elapsed().as_millis(), thumb.data_url.len() / 1024);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn psd_size_from_header() {
        let mut head = vec![0u8; 26];
        head[0..4].copy_from_slice(b"8BPS");
        head[14..18].copy_from_slice(&1080u32.to_be_bytes());
        head[18..22].copy_from_slice(&1920u32.to_be_bytes());
        assert_eq!(psd_dimensions(&head), Some((1920, 1080)));
        assert_eq!(psd_dimensions(b"8BPS"), None);
    }

    #[test]
    fn exr_accumulator_fits_and_averages() {
        use exr_thumb::{fit, Accumulator};
        assert_eq!(fit(4096, 2048, 256), (256, 128));
        assert_eq!(fit(100, 3000, 256), (8, 256));
        assert_eq!(fit(10, 10, 256), (10, 10));
        assert_eq!(fit(0, 10, 256), (0, 0));
        // 512x512 of opaque mid-grey linear 0.2140 (sRGB ~128) averages to that grey
        let mut acc = Accumulator::new(512, 512);
        for y in 0..512 {
            for x in 0..512 {
                acc.add(x, y, [0.2140, 0.2140, 0.2140, 1.0]);
            }
        }
        // Out of range positions are ignored, not a panic
        acc.add(10_000, 10_000, [1.0; 4]);
        let img = acc.finish().unwrap().to_rgba8();
        assert_eq!((img.width(), img.height()), (256, 256));
        let p = img.get_pixel(100, 100).0;
        assert!((p[0] as i32 - 128).abs() <= 2 && p[3] == 255, "{:?}", p);
    }
}
