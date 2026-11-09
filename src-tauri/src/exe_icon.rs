//! Icon of an executable, read from the file itself (the icon Explorer shows) as a PNG data URL.
//! nullSpace ships no third-party logos: software icons come from the user's own installs.

/// Default edge for extracted icons: sharp in 44px launcher tiles, small enough for localStorage
pub const DEFAULT_ICON_SIZE: u32 = 64;

#[cfg(target_os = "windows")]
pub fn extract_png_data_url(path: &str, size: u32) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use image::{DynamicImage, ImageOutputFormat, RgbaImage};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, PrivateExtractIconsW, HICON};

    if !std::path::Path::new(path).is_file() {
        return Err(format!("Not a file: {path}"));
    }

    // PrivateExtractIconsW takes a MAX_PATH buffer
    let wide: Vec<u16> = path.encode_utf16().collect();
    if wide.len() >= 260 {
        return Err("Path is longer than MAX_PATH".to_string());
    }
    let mut name = [0u16; 260];
    name[..wide.len()].copy_from_slice(&wide);

    let edge = size.clamp(16, 256) as i32;
    let mut icons = [HICON::default()];
    let count = unsafe { PrivateExtractIconsW(&name, 0, edge, edge, Some(&mut icons), None, 0) };
    // 0: the file has no icons; u32::MAX: it couldn't be read
    if count == 0 || count == u32::MAX || icons[0].is_invalid() {
        return Err("No icon in file".to_string());
    }

    let pixels = unsafe { icon_to_rgba(icons[0]) };
    unsafe {
        let _ = DestroyIcon(icons[0]);
    }
    let (width, height, rgba) = pixels?;

    let image = RgbaImage::from_raw(width, height, rgba).ok_or("Icon bitmap has an unexpected size")?;
    let mut bytes = std::io::Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(image)
        .write_to(&mut bytes, ImageOutputFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes.into_inner())))
}

#[cfg(not(target_os = "windows"))]
pub fn extract_png_data_url(_path: &str, _size: u32) -> Result<String, String> {
    Err("Icon extraction is only supported on Windows".to_string())
}

/// Straight-alpha RGBA pixels of an icon
#[cfg(target_os = "windows")]
unsafe fn icon_to_rgba(icon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Result<(u32, u32, Vec<u8>), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, ReleaseDC};
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    let mut info = ICONINFO::default();
    GetIconInfo(icon, &mut info).map_err(|e| e.to_string())?;

    let hdc = GetDC(HWND(0));
    let result = (|| {
        // Monochrome icons (no color bitmap) are left to the caller's fallback
        if info.hbmColor.is_invalid() {
            return Err("Monochrome icon".to_string());
        }
        let (width, height, mut pixels) = read_bitmap_bgra(hdc, info.hbmColor).ok_or("Can't read icon colors")?;

        // Icons without an alpha channel: opacity comes from the AND mask (black = opaque)
        if pixels.chunks_exact(4).all(|p| p[3] == 0) {
            let mask = read_bitmap_bgra(hdc, info.hbmMask)
                .filter(|(w, h, _)| *w == width && *h >= height)
                .map(|(_, _, m)| m);
            for (i, px) in pixels.chunks_exact_mut(4).enumerate() {
                px[3] = match &mask {
                    Some(m) if m[i * 4] != 0 => 0,
                    _ => 255,
                };
            }
        }

        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2); // BGRA -> RGBA
        }
        Ok((width, height, pixels))
    })();
    ReleaseDC(HWND(0), hdc);

    // GetIconInfo hands over copies of both bitmaps: they're ours to delete
    if !info.hbmColor.is_invalid() {
        DeleteObject(info.hbmColor);
    }
    if !info.hbmMask.is_invalid() {
        DeleteObject(info.hbmMask);
    }
    result
}

/// A bitmap as top-down 32-bit BGRA rows
#[cfg(target_os = "windows")]
unsafe fn read_bitmap_bgra(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
) -> Option<(u32, u32, Vec<u8>)> {
    use std::ffi::c_void;
    use windows::Win32::Graphics::Gdi::{
        GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };

    // Size from GetObjectW: a header-only GetDIBits call can write color masks past BITMAPINFO
    let mut bm = BITMAP::default();
    if GetObjectW(bitmap, std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut BITMAP as *mut c_void)) == 0 {
        return None;
    }
    let width = bm.bmWidth;
    let height = bm.bmHeight.abs();
    if width <= 0 || height <= 0 || width > 1024 || height > 2048 {
        return None;
    }

    let mut bmi = BITMAPINFO::default();
    bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    bmi.bmiHeader.biWidth = width;
    bmi.bmiHeader.biHeight = -height; // top-down
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB.0;

    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let lines = GetDIBits(
        hdc,
        bitmap,
        0,
        height as u32,
        Some(pixels.as_mut_ptr() as *mut c_void),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    if lines == 0 {
        return None;
    }
    Some((width as u32, height as u32, pixels))
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn extracts_icon_from_a_system_exe() {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
        let url = extract_png_data_url(&format!("{windir}\\explorer.exe"), DEFAULT_ICON_SIZE).unwrap();
        let b64 = url.strip_prefix("data:image/png;base64,").expect("PNG data URL");

        use base64::{engine::general_purpose::STANDARD, Engine as _};
        let png = image::load_from_memory(&STANDARD.decode(b64).unwrap()).unwrap().to_rgba8();
        assert_eq!(png.dimensions(), (DEFAULT_ICON_SIZE, DEFAULT_ICON_SIZE));
        // Not an empty bitmap: some pixels are opaque, and the corners stay transparent
        assert!(png.pixels().any(|p| p[3] == 255));
        assert!(png.pixels().any(|p| p[3] == 0));
    }

    #[test]
    fn missing_file_is_an_error() {
        assert!(extract_png_data_url("C:\\definitely\\not\\here.exe", 64).is_err());
    }
}
