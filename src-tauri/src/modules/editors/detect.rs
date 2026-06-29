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

/// Standard macOS application directories searched when Spotlight is unavailable or stale.
/// Includes `/Applications/Setapp` for SetApp-installed apps.
#[cfg(target_os = "macos")]
static MACOS_APP_DIRS: &[&str] = &[
    "/Applications",
    "/Applications/Setapp",
    "/System/Applications",
];

/// Scan known app directories for a `.app` bundle whose `Info.plist` declares `bundle_id`.
/// Falls back to this when `mdfind` returns nothing (Spotlight not indexed or stale).
#[cfg(target_os = "macos")]
fn find_app_by_bundle_id_in_dirs(bundle_id: &str) -> Option<String> {
    let mut dirs: Vec<std::path::PathBuf> = MACOS_APP_DIRS
        .iter()
        .map(std::path::PathBuf::from)
        .collect();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Applications"));
    }

    // Many Setapp apps append "-setapp" to their bundle ID (e.g. "com.krill.CodeRunner-setapp").
    let needle = format!("<string>{}</string>", bundle_id);
    let needle_setapp = format!("<string>{}-setapp</string>", bundle_id);
    for dir in &dirs {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("app") {
                continue;
            }
            let plist = path.join("Contents/Info.plist");
            if let Ok(contents) = std::fs::read_to_string(&plist) {
                if contents.contains(&needle) || contents.contains(&needle_setapp) {
                    return path.to_str().map(str::to_string);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_entry_platform(entry: &EditorEntry) -> Option<DetectedEditor> {
    // Skip editors with no CLI and no bundle (nothing to detect).
    if entry.cli_binary.is_empty() && entry.bundle_id.is_none() {
        return None;
    }

    let app_path = entry.bundle_id.and_then(|bid| {
        // Primary: Spotlight (fast, system-wide).
        let query = format!("kMDItemCFBundleIdentifier == \"{}\"", bid);
        let out = Command::new("mdfind").arg(&query).output().ok()?;
        if out.status.success() {
            if let Some(p) = extract_first_app_path(&String::from_utf8_lossy(&out.stdout)) {
                return Some(p);
            }
        }
        // Fallback: filesystem scan (handles Setapp and non-indexed locations).
        find_app_by_bundle_id_in_dirs(bid)
    });

    let Some(app_path) = app_path else {
        // Bundle not found anywhere: try PATH for editors that have a CLI
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
    // Editors launched via `open -b <bundle_id>` (no usable CLI).
    // If the entry has args_before_path (e.g. --working-directory for Ghostty),
    // inject --args so macOS passes them through to the app.
    if is_macos_open_only(entry.id) {
        let bundle_id = entry.bundle_id?;
        let mut args = vec!["-b".to_string(), bundle_id.to_string()];
        if !entry.args_before_path.is_empty() {
            args.push("--args".to_string());
            args.extend(entry.args_before_path.iter().map(|s| s.to_string()));
        }
        return Some(("open".to_string(), args));
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
        return Some((cli, entry.args_before_path.iter().map(|s| s.to_string()).collect()));
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

#[cfg(target_os = "macos")]
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
