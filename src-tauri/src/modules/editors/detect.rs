use crate::modules::editors::catalog::EditorEntry;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedEditor {
    pub id: String,
    pub name: String,
    /// Resolved binary to call (e.g. `/usr/local/bin/code`, `open`, or a Toolbox script path).
    pub binary: String,
    /// Args inserted between `binary` and the target path at launch time.
    pub args_before_path: Vec<String>,
}

pub fn detect_all() -> Vec<DetectedEditor> {
    crate::modules::editors::catalog::CATALOG
        .iter()
        .filter_map(detect_entry)
        .collect()
}

fn detect_entry(entry: &EditorEntry) -> Option<DetectedEditor> {
    detect_entry_platform(entry)
}

#[cfg(target_os = "macos")]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    // Implemented in Task 2
    let _ = entry;
    None
}

#[cfg(target_os = "linux")]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    // Implemented in Task 2
    let _ = entry;
    None
}

#[cfg(target_os = "windows")]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    // Implemented in Task 2
    let _ = entry;
    None
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    let _ = entry;
    None
}
