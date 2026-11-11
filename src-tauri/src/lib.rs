mod engines;

use engines::{
    convert_image_native, extract_archive_to_zip_native, ffmpeg_spec_for_target, replace_ext,
    NativeJobResult,
};
use std::path::Path;
use tauri_plugin_shell::ShellExt;

async fn run_ffmpeg(app: &tauri::AppHandle, args: &[String]) -> Result<(), String> {
    // Prefer bundled sidecar (`binaries/ffmpeg`), fall back to system `ffmpeg` in dev
    if let Ok(sidecar) = app.shell().sidecar("ffmpeg") {
        let out = sidecar
            .args(args)
            .output()
            .await
            .map_err(|e| format!("ffmpeg sidecar failed: {e}"))?;
        if out.status.success() {
            return Ok(());
        }
        return Err(format!(
            "ffmpeg sidecar exited with error: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    let status = std::process::Command::new("ffmpeg")
        .args(args)
        .output()
        .map_err(|e| format!("ffmpeg execution failed (sidecar & PATH missing): {e}"))?;

    if !status.status.success() {
        return Err(format!(
            "ffmpeg error: {}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }
    Ok(())
}

#[tauri::command]
fn native_convert_image(
    file_name: String,
    bytes: Vec<u8>,
    target_format: String,
    quality: Option<u8>,
    max_width: Option<u32>,
) -> Result<NativeJobResult, String> {
    convert_image_native(&file_name, &bytes, &target_format, quality, max_width)
}

#[tauri::command]
fn native_extract_to_zip(
    file_name: String,
    bytes: Vec<u8>,
    source_format: String,
) -> Result<NativeJobResult, String> {
    extract_archive_to_zip_native(&file_name, &bytes, &source_format)
}

#[tauri::command]
async fn native_convert_media(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
    source_format: String,
    target_format: String,
) -> Result<NativeJobResult, String> {
    let dir = tempfile::tempdir().map_err(|e| format!("Tempdir failed: {e}"))?;
    let in_ext = if source_format.is_empty() {
        "bin"
    } else {
        source_format.as_str()
    };
    let in_path = dir.path().join(format!("input.{in_ext}"));
    std::fs::write(&in_path, &bytes).map_err(|e| format!("Write temp input failed: {e}"))?;

    let probe_out = dir.path().join("output.tmp");
    let spec = ffmpeg_spec_for_target(
        &in_path.to_string_lossy(),
        &probe_out.to_string_lossy(),
        &target_format,
    )?;
    let out_path = dir.path().join(format!("output.{}", spec.ext));
    let final_spec = ffmpeg_spec_for_target(
        &in_path.to_string_lossy(),
        &out_path.to_string_lossy(),
        &target_format,
    )?;

    run_ffmpeg(&app, &final_spec.args).await?;
    let out_bytes = std::fs::read(&out_path).map_err(|e| format!("Read output failed: {e}"))?;

    Ok(NativeJobResult {
        output_name: replace_ext(&file_name, final_spec.ext),
        mime: final_spec.mime.to_string(),
        bytes: out_bytes,
    })
}

#[tauri::command]
async fn native_convert_media_path(
    app: tauri::AppHandle,
    input_path: String,
    target_format: String,
) -> Result<String, String> {
    let in_p = Path::new(&input_path);
    let stem = in_p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("qsak-output");
    let parent = in_p.parent().unwrap_or_else(|| Path::new("."));

    let spec = ffmpeg_spec_for_target(&input_path, "out.tmp", &target_format)?;
    let out_path = parent.join(format!("{stem}_qsak.{}", spec.ext));
    let final_spec =
        ffmpeg_spec_for_target(&input_path, &out_path.to_string_lossy(), &target_format)?;

    run_ffmpeg(&app, &final_spec.args).await?;
    Ok(out_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            native_convert_image,
            native_extract_to_zip,
            native_convert_media,
            native_convert_media_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running qsak desktop application");
}
