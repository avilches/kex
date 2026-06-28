pub mod catalog;
pub mod detect;

use detect::DetectedEditor;
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub editors: Vec<DetectedEditor>,
}

/// Scans the system for installed editors and returns those found.
/// Runs detection synchronously on a blocking thread to avoid blocking the async runtime.
#[tauri::command]
pub async fn editor_scan() -> Result<Vec<DetectedEditor>, String> {
    tauri::async_runtime::spawn_blocking(detect::detect_all)
        .await
        .map_err(|e| e.to_string())
}

/// Launches an editor with the given path. Fire-and-forget: does not wait for the process.
/// `binary` is the executable (full path or name in PATH).
/// `args_before_path` are inserted between the binary and the target path.
/// `path` is the file or folder to open.
#[tauri::command]
pub async fn editor_open(
    binary: String,
    args_before_path: Vec<String>,
    path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        Command::new(&binary)
            .args(&args_before_path)
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to launch editor: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}
