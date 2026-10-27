use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::modules::pty::hook_router::is_safe_tab_id;

static DIR: OnceLock<PathBuf> = OnceLock::new();

/// One file per hibernated tab, so the workspace JSON does not grow with them. The frontend
/// already trims to this size; the cap here is the backstop for anything else that calls in.
pub const MAX_BYTES: usize = 256 * 1024;

/// Must be called once in setup() before any hibernate-lines operation.
pub fn init(data_dir: &Path) {
    let _ = DIR.set(data_dir.join("hibernate-lines"));
}

fn dir() -> Result<&'static PathBuf, String> {
    DIR.get()
        .ok_or_else(|| "hibernate-lines store not initialized".to_string())
}

fn file_for(dir: &Path, tab_id: &str) -> Result<PathBuf, String> {
    if !is_safe_tab_id(tab_id) {
        return Err("invalid tab id".to_string());
    }
    Ok(dir.join(format!("{tab_id}.ans")))
}

fn save_in(dir: &Path, tab_id: &str, text: &str) -> Result<(), String> {
    let path = file_for(dir, tab_id)?;
    if text.len() > MAX_BYTES {
        return Err("hibernate lines too large".to_string());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
    }
    let mut tmp = tempfile::Builder::new()
        .prefix(".kex-")
        .suffix(".tmp")
        .tempfile_in(dir)
        .map_err(|e| e.to_string())?;
    tmp.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    tmp.persist(&path).map_err(|e| e.error.to_string())?;
    Ok(())
}

fn read_in(dir: &Path, tab_id: &str) -> Result<Option<String>, String> {
    let path = file_for(dir, tab_id)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn delete_in(dir: &Path, tab_id: &str) -> Result<(), String> {
    let path = file_for(dir, tab_id)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Removes the files of tabs that are in no window any more, and any leftover temp file, so a
/// tab that was closed while Kex was not running leaves nothing behind. Returns how many went.
fn sweep_in(dir: &Path, known: &HashSet<String>) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let keep = name
            .strip_suffix(".ans")
            .is_some_and(|id| known.contains(id));
        if !keep && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

pub fn sweep(known: &HashSet<String>) {
    if let Ok(d) = dir() {
        let removed = sweep_in(d, known);
        if removed > 0 {
            log::info!("[hibernate-lines] swept {removed} orphan file(s)");
        }
    }
}

#[tauri::command]
pub fn hibernate_lines_save(tab_id: String, text: String) -> Result<(), String> {
    save_in(dir()?, &tab_id, &text)
}

#[tauri::command]
pub fn hibernate_lines_read(tab_id: String) -> Result<Option<String>, String> {
    read_in(dir()?, &tab_id)
}

#[tauri::command]
pub fn hibernate_lines_delete(tab_ids: Vec<String>) -> Result<(), String> {
    let d = dir()?;
    for id in &tab_ids {
        delete_in(d, id)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_overwrites() {
        let tmp = tempfile::tempdir().unwrap();
        let d = tmp.path().join("hl");
        save_in(&d, "tab-a", "one").unwrap();
        save_in(&d, "tab-a", "two").unwrap();
        assert_eq!(read_in(&d, "tab-a").unwrap().as_deref(), Some("two"));
        assert_eq!(read_in(&d, "tab-b").unwrap(), None);
    }

    #[test]
    fn rejects_ids_that_could_leave_the_folder() {
        let tmp = tempfile::tempdir().unwrap();
        for bad in ["", "..", "../x", "a/b", "a\\b", &"x".repeat(65)] {
            assert!(save_in(tmp.path(), bad, "x").is_err(), "{bad}");
            assert!(read_in(tmp.path(), bad).is_err(), "{bad}");
            assert!(delete_in(tmp.path(), bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn refuses_text_over_the_cap_and_keeps_the_old_file() {
        let tmp = tempfile::tempdir().unwrap();
        save_in(tmp.path(), "tab-a", "kept").unwrap();
        assert!(save_in(tmp.path(), "tab-a", &"x".repeat(MAX_BYTES + 1)).is_err());
        assert_eq!(read_in(tmp.path(), "tab-a").unwrap().as_deref(), Some("kept"));
    }

    #[test]
    fn delete_is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        save_in(tmp.path(), "tab-a", "x").unwrap();
        delete_in(tmp.path(), "tab-a").unwrap();
        delete_in(tmp.path(), "tab-a").unwrap();
        assert_eq!(read_in(tmp.path(), "tab-a").unwrap(), None);
    }

    #[test]
    fn sweep_keeps_known_tabs_and_drops_the_rest() {
        let tmp = tempfile::tempdir().unwrap();
        save_in(tmp.path(), "tab-a", "x").unwrap();
        save_in(tmp.path(), "tab-b", "y").unwrap();
        fs::write(tmp.path().join(".kex-left.tmp"), "z").unwrap();
        let known = HashSet::from(["tab-a".to_string()]);
        assert_eq!(sweep_in(tmp.path(), &known), 2);
        assert!(read_in(tmp.path(), "tab-a").unwrap().is_some());
        assert_eq!(read_in(tmp.path(), "tab-b").unwrap(), None);
    }

    #[cfg(unix)]
    #[test]
    fn files_and_folder_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let d = tmp.path().join("hl");
        save_in(&d, "tab-a", "x").unwrap();
        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&d), 0o700);
        assert_eq!(mode(&d.join("tab-a.ans")), 0o600);
    }
}
