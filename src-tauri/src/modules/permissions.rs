use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionKind {
    Desktop,
    Documents,
    Downloads,
    Icloud,
    FullDisk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeState {
    Granted,
    Denied,
    Unavailable,
}

pub fn classify_read(result: &std::io::Result<()>) -> ProbeState {
    match result {
        Ok(()) => ProbeState::Granted,
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => ProbeState::Denied,
        Err(e) if e.raw_os_error() == Some(1) => ProbeState::Denied,
        Err(_) => ProbeState::Unavailable,
    }
}

pub fn probe_path(kind: PermissionKind, home: &Path) -> PathBuf {
    match kind {
        PermissionKind::Desktop => home.join("Desktop"),
        PermissionKind::Documents => home.join("Documents"),
        PermissionKind::Downloads => home.join("Downloads"),
        PermissionKind::Icloud => home.join("Library/Mobile Documents/com~apple~CloudDocs"),
        PermissionKind::FullDisk => home.join("Library/Safari"),
    }
}

pub fn settings_url(kind: PermissionKind) -> &'static str {
    match kind {
        PermissionKind::Desktop => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_DesktopFolder"
        }
        PermissionKind::Documents => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_DocumentsFolder"
        }
        PermissionKind::Downloads => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_DownloadsFolder"
        }
        PermissionKind::Icloud => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders"
        }
        PermissionKind::FullDisk => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
        }
    }
}

#[cfg(target_os = "macos")]
fn probe_blocking(kind: PermissionKind) -> ProbeState {
    let Some(home) = dirs::home_dir() else {
        return ProbeState::Unavailable;
    };
    // Reading a folder whose permission is undecided makes macOS show its prompt.
    classify_read(&std::fs::read_dir(probe_path(kind, &home)).map(|_| ()))
}

#[tauri::command]
pub async fn permission_probe(kind: PermissionKind) -> Result<ProbeState, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || probe_blocking(kind))
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = kind;
        Ok(ProbeState::Unavailable)
    }
}

#[tauri::command]
pub async fn permission_open_settings(kind: PermissionKind) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            std::process::Command::new("open")
                .arg(settings_url(kind))
                .status()
                .map_err(|e| e.to_string())
                .and_then(|s| {
                    if s.success() {
                        Ok(())
                    } else {
                        Err(format!("open exited with {s}"))
                    }
                })
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = kind;
        Err("Privacy settings are only available on macOS".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Error, ErrorKind};

    #[test]
    fn classify_read_maps_permission_denied_to_denied() {
        let kind = Err(Error::from(ErrorKind::PermissionDenied));
        assert_eq!(classify_read(&kind), ProbeState::Denied);
        let eperm = Err(Error::from_raw_os_error(1));
        assert_eq!(classify_read(&eperm), ProbeState::Denied);
    }

    #[test]
    fn classify_read_maps_ok_to_granted() {
        assert_eq!(classify_read(&Ok(())), ProbeState::Granted);
    }

    #[test]
    fn classify_read_maps_not_found_to_unavailable() {
        let r = Err(Error::from(ErrorKind::NotFound));
        assert_eq!(classify_read(&r), ProbeState::Unavailable);
    }

    #[test]
    fn classify_read_maps_other_errors_to_unavailable() {
        let r = Err(Error::from(ErrorKind::Other));
        assert_eq!(classify_read(&r), ProbeState::Unavailable);
    }

    #[test]
    fn probe_path_per_kind() {
        let home = Path::new("/Users/x");
        let p = |k| probe_path(k, home).to_string_lossy().into_owned();
        assert_eq!(p(PermissionKind::Desktop), "/Users/x/Desktop");
        assert_eq!(p(PermissionKind::Documents), "/Users/x/Documents");
        assert_eq!(p(PermissionKind::Downloads), "/Users/x/Downloads");
        assert_eq!(
            p(PermissionKind::Icloud),
            "/Users/x/Library/Mobile Documents/com~apple~CloudDocs"
        );
        assert_eq!(p(PermissionKind::FullDisk), "/Users/x/Library/Safari");
    }

    #[test]
    fn settings_url_per_kind() {
        let base = "x-apple.systempreferences:com.apple.preference.security?";
        assert_eq!(
            settings_url(PermissionKind::Desktop),
            format!("{base}Privacy_DesktopFolder")
        );
        assert_eq!(
            settings_url(PermissionKind::Documents),
            format!("{base}Privacy_DocumentsFolder")
        );
        assert_eq!(
            settings_url(PermissionKind::Downloads),
            format!("{base}Privacy_DownloadsFolder")
        );
        assert_eq!(
            settings_url(PermissionKind::Icloud),
            format!("{base}Privacy_FilesAndFolders")
        );
        assert_eq!(
            settings_url(PermissionKind::FullDisk),
            format!("{base}Privacy_AllFiles")
        );
    }

    #[test]
    fn permission_kind_deserializes_camel_case() {
        let full: PermissionKind = serde_json::from_str("\"fullDisk\"").unwrap();
        assert_eq!(full, PermissionKind::FullDisk);
        let icloud: PermissionKind = serde_json::from_str("\"icloud\"").unwrap();
        assert_eq!(icloud, PermissionKind::Icloud);
    }
}
