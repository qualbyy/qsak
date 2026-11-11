use flate2::read::GzDecoder;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::ImageFormat;
use serde::Serialize;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use tar::Archive;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeJobResult {
    pub output_name: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}

pub fn replace_ext(file_name: &str, new_ext: &str) -> String {
    let clean = new_ext.trim_start_matches('.');
    match file_name.rfind('.') {
        Some(idx) if idx > 0 => format!("{}.{}", &file_name[..idx], clean),
        _ => format!("{}.{}", file_name, clean),
    }
}

pub fn convert_image_native(
    file_name: &str,
    bytes: &[u8],
    target_format: &str,
    quality: Option<u8>,
    max_width: Option<u32>,
) -> Result<NativeJobResult, String> {
    let mut img = image::load_from_memory(bytes).map_err(|e| format!("Image decode failed: {e}"))?;

    if let Some(mw) = max_width {
        if mw > 0 && img.width() > mw {
            let new_h = ((img.height() as f64) * (mw as f64) / (img.width() as f64))
                .round()
                .max(1.0) as u32;
            img = img.resize_exact(mw, new_h, FilterType::Lanczos3);
        }
    }

    let target = target_format.to_lowercase();
    let q = quality.unwrap_or(85).clamp(10, 100);
    let mut out = Cursor::new(Vec::new());

    let (ext, mime) = match target.as_str() {
        "png" => {
            img.write_to(&mut out, ImageFormat::Png)
                .map_err(|e| format!("PNG encode failed: {e}"))?;
            ("png", "image/png")
        }
        "jpg" | "jpeg" => {
            let rgb = img.to_rgb8();
            let mut encoder = JpegEncoder::new_with_quality(&mut out, q);
            encoder
                .encode_image(&rgb)
                .map_err(|e| format!("JPEG encode failed: {e}"))?;
            ("jpg", "image/jpeg")
        }
        "webp" => {
            img.write_to(&mut out, ImageFormat::WebP)
                .map_err(|e| format!("WebP encode failed: {e}"))?;
            ("webp", "image/webp")
        }
        "ico" => {
            let resized = img.resize_exact(64, 64, FilterType::Lanczos3);
            resized
                .write_to(&mut out, ImageFormat::Ico)
                .map_err(|e| format!("ICO encode failed: {e}"))?;
            ("ico", "image/x-icon")
        }
        "gif" => {
            img.write_to(&mut out, ImageFormat::Gif)
                .map_err(|e| format!("GIF encode failed: {e}"))?;
            ("gif", "image/gif")
        }
        "bmp" => {
            img.write_to(&mut out, ImageFormat::Bmp)
                .map_err(|e| format!("BMP encode failed: {e}"))?;
            ("bmp", "image/bmp")
        }
        other => return Err(format!("Native image format unsupported: {other}")),
    };

    Ok(NativeJobResult {
        output_name: replace_ext(file_name, ext),
        mime: mime.to_string(),
        bytes: out.into_inner(),
    })
}

pub fn extract_archive_to_zip_native(
    file_name: &str,
    bytes: &[u8],
    source_format: &str,
) -> Result<NativeJobResult, String> {
    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
    let fmt = source_format.to_lowercase();

    match fmt.as_str() {
        "zip" => {
            let mut archive =
                ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("ZIP open error: {e}"))?;
            for i in 0..archive.len() {
                let mut f = archive.by_index(i).map_err(|e| format!("ZIP entry error: {e}"))?;
                if f.is_dir() {
                    continue;
                }
                let mut buf = Vec::new();
                f.read_to_end(&mut buf)
                    .map_err(|e| format!("ZIP read error: {e}"))?;
                entries.push((f.name().to_string(), buf));
            }
        }
        "tgz" | "tar" => {
            let tar_bytes: Vec<u8> = if fmt == "tgz" || file_name.to_lowercase().ends_with(".tar.gz") {
                let mut dec = GzDecoder::new(Cursor::new(bytes));
                let mut out = Vec::new();
                dec.read_to_end(&mut out)
                    .map_err(|e| format!("Gzip decode error: {e}"))?;
                out
            } else {
                bytes.to_vec()
            };

            let mut tar = Archive::new(Cursor::new(tar_bytes));
            for entry in tar.entries().map_err(|e| format!("TAR read error: {e}"))? {
                let mut e = entry.map_err(|err| format!("TAR entry error: {err}"))?;
                if !e.header().entry_type().is_file() {
                    continue;
                }
                let path = e
                    .path()
                    .map_err(|err| format!("TAR path error: {err}"))?
                    .to_string_lossy()
                    .to_string();
                let mut buf = Vec::new();
                e.read_to_end(&mut buf)
                    .map_err(|err| format!("TAR data error: {err}"))?;
                entries.push((path, buf));
            }
        }
        "gz" => {
            let mut dec = GzDecoder::new(Cursor::new(bytes));
            let mut out = Vec::new();
            dec.read_to_end(&mut out)
                .map_err(|e| format!("Gzip decode error: {e}"))?;
            let inner = file_name
                .strip_suffix(".gz")
                .or_else(|| file_name.strip_suffix(".GZ"))
                .unwrap_or("extracted.bin");
            entries.push((inner.to_string(), out));
        }
        "7z" => {
            let tmp = tempfile::tempdir().map_err(|e| format!("Tempdir error: {e}"))?;
            sevenz_rust::decompress(Cursor::new(bytes), tmp.path())
                .map_err(|e| format!("7z decompress error: {e}"))?;
            collect_dir_recursive(tmp.path(), tmp.path(), &mut entries)?;
        }
        other => return Err(format!("Native archive format unsupported: {other}")),
    }

    let mut zip_buf = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut zip_buf);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, data) in entries {
            writer
                .start_file(name, opts)
                .map_err(|e| format!("ZIP write start error: {e}"))?;
            writer
                .write_all(&data)
                .map_err(|e| format!("ZIP write data error: {e}"))?;
        }
        writer.finish().map_err(|e| format!("ZIP finish error: {e}"))?;
    }

    let clean_base = file_name.strip_suffix(".tar.gz").unwrap_or(file_name);
    Ok(NativeJobResult {
        output_name: replace_ext(clean_base, "zip"),
        mime: "application/zip".to_string(),
        bytes: zip_buf.into_inner(),
    })
}

fn collect_dir_recursive(
    root: &Path,
    dir: &Path,
    out: &mut Vec<(String, Vec<u8>)>,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| format!("Read dir error: {e}"))? {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_dir_recursive(root, &path, out)?;
        } else if path.is_file() {
            let rel = path
                .strip_prefix(root)
                .map_err(|e| format!("Path strip error: {e}"))?
                .to_string_lossy()
                .replace('\\', "/");
            let data = std::fs::read(&path).map_err(|e| format!("Read file error: {e}"))?;
            out.push((rel, data));
        }
    }
    Ok(())
}

pub struct FfmpegSpec {
    pub args: Vec<String>,
    pub ext: &'static str,
    pub mime: &'static str,
}

pub fn ffmpeg_spec_for_target(
    input_path: &str,
    output_path: &str,
    target_format: &str,
) -> Result<FfmpegSpec, String> {
    let mut args = vec!["-y".to_string(), "-i".to_string(), input_path.to_string()];

    let (ext, mime, extra): (&'static str, &'static str, Vec<&str>) = match target_format
        .to_lowercase()
        .as_str()
    {
        "mp4" => ("mp4", "video/mp4", vec!["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "128k"]),
        "webm" => ("webm", "video/webm", vec!["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus"]),
        "gif" => ("gif", "image/gif", vec!["-vf", "fps=12,scale=480:-1:flags=lanczos", "-loop", "0"]),
        "mp4-mute" => ("mp4", "video/mp4", vec!["-c:v", "copy", "-an"]),
        "mp4-10mb" => ("mp4", "video/mp4", vec!["-c:v", "libx264", "-preset", "fast", "-b:v", "1200k", "-maxrate", "1500k", "-bufsize", "2400k", "-c:a", "aac", "-b:a", "96k"]),
        "mp4-25mb" => ("mp4", "video/mp4", vec!["-c:v", "libx264", "-preset", "fast", "-b:v", "3000k", "-maxrate", "3600k", "-bufsize", "6000k", "-c:a", "aac", "-b:a", "128k"]),
        "mp3" => ("mp3", "audio/mpeg", vec!["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]),
        "wav" => ("wav", "audio/wav", vec!["-vn", "-c:a", "pcm_s16le"]),
        "ogg" => ("ogg", "audio/ogg", vec!["-vn", "-c:a", "libvorbis", "-q:a", "5"]),
        "aac" => ("m4a", "audio/mp4", vec!["-vn", "-c:a", "aac", "-b:a", "192k"]),
        "flac" => ("flac", "audio/flac", vec!["-vn", "-c:a", "flac"]),
        other => return Err(format!("Unsupported media target: {other}")),
    };

    args.extend(extra.into_iter().map(String::from));
    args.push(output_path.to_string());

    Ok(FfmpegSpec { args, ext, mime })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    #[test]
    fn converts_png_to_webp_and_jpg() {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(16, 16, Rgba([110, 168, 220, 255]));
        let mut png_bytes = Cursor::new(Vec::new());
        img.write_to(&mut png_bytes, ImageFormat::Png).unwrap();

        let webp = convert_image_native("dot.png", png_bytes.get_ref(), "webp", Some(85), Some(8))
            .unwrap();
        assert_eq!(webp.output_name, "dot.webp");
        assert_eq!(webp.mime, "image/webp");
        assert!(!webp.bytes.is_empty());

        let jpg =
            convert_image_native("dot.png", png_bytes.get_ref(), "jpg", Some(90), None).unwrap();
        assert_eq!(jpg.output_name, "dot.jpg");
        assert_eq!(jpg.mime, "image/jpeg");
    }

    #[test]
    fn repacks_zip_entries() {
        let mut raw_zip = Cursor::new(Vec::new());
        {
            let mut w = ZipWriter::new(&mut raw_zip);
            w.start_file("hello.txt", SimpleFileOptions::default())
                .unwrap();
            w.write_all(b"qsak").unwrap();
            w.finish().unwrap();
        }
        let res = extract_archive_to_zip_native("test.zip", raw_zip.get_ref(), "zip").unwrap();
        assert_eq!(res.output_name, "test.zip");
        assert!(!res.bytes.is_empty());
    }

    #[test]
    fn builds_ffmpeg_args() {
        let spec = ffmpeg_spec_for_target("in.mkv", "out.mp3", "mp3").unwrap();
        assert_eq!(spec.ext, "mp3");
        assert!(spec.args.contains(&"libmp3lame".to_string()));
    }
}
