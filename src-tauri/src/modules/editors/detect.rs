use crate::modules::editors::catalog::{EditorEntry, is_jetbrains, is_macos_open_only, CATALOG};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

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
    CATALOG.iter().filter_map(detect_entry).collect()
}

fn detect_entry(entry: &EditorEntry) -> Option<DetectedEditor> {
    detect_entry_platform(entry)
}

// ---- helpers (used on all platforms) ----------------------------------------

pub(crate) fn extract_first_app_path(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(str::to_string)
}

pub(crate) fn which_binary(name: &str) -> Option<String> {
    if name.is_empty() {
        return None;
    }
    let output = Command::new("which").arg(name).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() { None } else { Some(path) }
}

// ---- macOS ------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    // Skip editors with no CLI and no bundle (nothing to detect).
    if entry.cli_binary.is_empty() && entry.bundle_id.is_none() {
        return None;
    }

    let app_path = entry.bundle_id.and_then(|bid| {
        let query = format!("kMDItemCFBundleIdentifier == \"{}\"", bid);
        let out = Command::new("mdfind").arg(&query).output().ok()?;
        if out.status.success() {
            extract_first_app_path(&String::from_utf8_lossy(&out.stdout))
        } else {
            None
        }
    });

    let Some(app_path) = app_path else {
        // Bundle not found: try PATH for editors that have a CLI
        return detect_via_which(entry);
    };

    // Resolve the actual binary to invoke
    let (binary, args) = resolve_launch_macos(entry, &app_path)?;

    Some(DetectedEditor {
        id: entry.id.to_string(),
        name: entry.name.to_string(),
        binary,
        args_before_path: args,
    })
}

#[cfg(target_os = "macos")]
fn resolve_launch_macos(entry: &EditorEntry, app_path: &str) -> Option<(String, Vec<String>)> {
    // Editors launched via `open -b <bundle_id>` (no CLI)
    if is_macos_open_only(entry.id) {
        let bundle_id = entry.bundle_id?;
        return Some(("open".to_string(), vec!["-b".to_string(), bundle_id.to_string()]));
    }

    // Zed ships a CLI binary inside the bundle
    if entry.id == "zed" || entry.id == "zed-preview" {
        let cli = format!("{}/Contents/MacOS/cli", app_path);
        if Path::new(&cli).exists() {
            return Some((cli, vec![]));
        }
    }

    // JetBrains: prefer Toolbox CLI script, fall back to `open -na`
    if is_jetbrains(entry.id) {
        if let Some(toolbox) = jetbrains_toolbox_path_macos(entry.cli_binary) {
            return Some((toolbox, vec![]));
        }
        if let Some(app_name) = entry.macos_app_name {
            return Some((
                "open".to_string(),
                vec![
                    "-na".to_string(),
                    format!("{}.app", app_name),
                    "--args".to_string(),
                ],
            ));
        }
        return None;
    }

    // General case: prefer CLI in PATH, fall back to `open -a`
    if let Some(cli) = which_binary(entry.cli_binary) {
        return Some((cli, vec![]));
    }

    // Fall back to `open -a "<App Name>.app"`
    let app_name = Path::new(app_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)?;
    Some(("open".to_string(), vec!["-a".to_string(), format!("{}.app", app_name)]))
}

#[cfg(target_os = "macos")]
fn jetbrains_toolbox_path_macos(cli_binary: &str) -> Option<String> {
    if cli_binary.is_empty() {
        return None;
    }
    let home = dirs::home_dir()?;
    let path = home
        .join("Library/Application Support/JetBrains/Toolbox/scripts")
        .join(cli_binary);
    if path.exists() {
        path.to_str().map(str::to_string)
    } else {
        None
    }
}

// ---- Linux ------------------------------------------------------------------

#[cfg(target_os = "linux")]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    // macOS-only editors are not available on Linux
    if is_macos_open_only(entry.id) {
        return None;
    }

    let binary = if is_jetbrains(entry.id) {
        jetbrains_toolbox_path_linux(entry.cli_binary)
            .or_else(|| which_binary(entry.cli_binary))?
    } else {
        which_binary(entry.cli_binary)?
    };

    Some(DetectedEditor {
        id: entry.id.to_string(),
        name: entry.name.to_string(),
        binary,
        args_before_path: entry.args_before_path.iter().map(|s| s.to_string()).collect(),
    })
}

#[cfg(target_os = "linux")]
fn jetbrains_toolbox_path_linux(cli_binary: &str) -> Option<String> {
    if cli_binary.is_empty() {
        return None;
    }
    let home = dirs::home_dir()?;
    let path = home
        .join(".local/share/JetBrains/Toolbox/scripts")
        .join(cli_binary);
    if path.exists() {
        path.to_str().map(str::to_string)
    } else {
        None
    }
}

// ---- Windows ----------------------------------------------------------------

#[cfg(target_os = "windows")]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    if is_macos_open_only(entry.id) {
        return None;
    }

    let binary = if is_jetbrains(entry.id) {
        jetbrains_toolbox_path_windows(entry.cli_binary)
            .or_else(|| where_binary(entry.cli_binary))?
    } else {
        where_binary(entry.cli_binary)?
    };

    Some(DetectedEditor {
        id: entry.id.to_string(),
        name: entry.name.to_string(),
        binary,
        args_before_path: entry.args_before_path.iter().map(|s| s.to_string()).collect(),
    })
}

#[cfg(target_os = "windows")]
fn where_binary(name: &str) -> Option<String> {
    if name.is_empty() {
        return None;
    }
    let output = Command::new("where").arg(name).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(str::to_string)?;
    if path.is_empty() { None } else { Some(path) }
}

#[cfg(target_os = "windows")]
fn jetbrains_toolbox_path_windows(cli_binary: &str) -> Option<String> {
    if cli_binary.is_empty() {
        return None;
    }
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let path = std::path::Path::new(&local_app_data)
        .join("JetBrains/Toolbox/scripts")
        .join(format!("{}.cmd", cli_binary));
    if path.exists() {
        path.to_str().map(str::to_string)
    } else {
        None
    }
}

// ---- fallback (unsupported platform) ----------------------------------------

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn detect_entry_platform(_entry: &EditorEntry) -> Option<DetectedEditor> {
    None
}

// ---- shared helper for PATH fallback ----------------------------------------

fn detect_via_which(entry: &EditorEntry) -> Option<DetectedEditor> {
    if entry.cli_binary.is_empty() {
        return None;
    }
    let binary = which_binary(entry.cli_binary)?;
    Some(DetectedEditor {
        id: entry.id.to_string(),
        name: entry.name.to_string(),
        binary,
        args_before_path: entry.args_before_path.iter().map(|s| s.to_string()).collect(),
    })
}

// ---- tests ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_first_app_path_returns_first_line() {
        let output = "/Applications/Visual Studio Code.app\n/Applications/Visual Studio Code 2.app\n";
        assert_eq!(
            extract_first_app_path(output),
            Some("/Applications/Visual Studio Code.app".to_string())
        );
    }

    #[test]
    fn extract_first_app_path_returns_none_for_empty() {
        assert_eq!(extract_first_app_path(""), None);
        assert_eq!(extract_first_app_path("   \n  "), None);
    }

    #[test]
    fn extract_first_app_path_trims_whitespace() {
        let output = "  /Applications/Zed.app  \n";
        assert_eq!(
            extract_first_app_path(output),
            Some("/Applications/Zed.app".to_string())
        );
    }

    #[test]
    fn which_binary_returns_none_for_nonexistent() {
        assert_eq!(which_binary("__kex_nonexistent_binary_xyz__"), None);
    }
}
