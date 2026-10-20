use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

// The palette only needs closed terminals and files from the recent past. The cap keeps the
// most used entries, not only the newest, so a directory reopened many times survives it.
pub const CLOSED_TABS_CAP: usize = 200;

fn store_lock() -> &'static Mutex<()> {
    STORE_LOCK.get_or_init(|| Mutex::new(()))
}

/// Must be called once in setup() before any closed-tabs operation.
pub fn init(data_dir: PathBuf) {
    let _ = DATA_DIR.set(data_dir);
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClosedTabRecord {
    pub kind: String,
    pub path: String,
    pub workspace_id: String,
    pub closed_at: u64,
    pub uses: u64,
    pub last_used_at: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct ClosedTabStore {
    version: u32,
    entries: Vec<ClosedTabRecord>,
}

fn store_path() -> Option<PathBuf> {
    DATA_DIR.get().map(|d| d.join("closed-tabs.json"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// Forward slashes make the same directory compare equal whichever side produced it (OSC 7,
// the explorer or the OS itself).
fn normalize_path(path: &str) -> String {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed.len() > 1 && !trimmed.ends_with(":/") {
        trimmed.trim_end_matches('/').to_string()
    } else {
        trimmed
    }
}

fn read_store(path: &Path) -> ClosedTabStore {
    let Ok(content) = std::fs::read_to_string(path) else {
        return ClosedTabStore {
            version: 1,
            entries: Vec::new(),
        };
    };
    serde_json::from_str(&content).unwrap_or(ClosedTabStore {
        version: 1,
        entries: Vec::new(),
    })
}

// Newest use first, then most used, then most recently closed. Keeping the same order in the
// file and in the palette makes the cap drop exactly the rows the user is least likely to pick.
fn by_weight(a: &ClosedTabRecord, b: &ClosedTabRecord) -> std::cmp::Ordering {
    b.uses
        .cmp(&a.uses)
        .then_with(|| b.last_used_at.cmp(&a.last_used_at))
        .then_with(|| b.closed_at.cmp(&a.closed_at))
}

fn trim(entries: &mut Vec<ClosedTabRecord>, cap: usize) {
    if entries.len() <= cap {
        return;
    }
    entries.sort_by(by_weight);
    entries.truncate(cap);
}

fn write_store(path: &Path, mut store: ClosedTabStore) -> Result<(), String> {
    trim(&mut store.entries, CLOSED_TABS_CAP);
    let out = serde_json::to_string_pretty(&store).map_err(|e| format!("serialize: {e}"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let tmp = path.with_extension("json.kex-tmp");
    std::fs::write(&tmp, out).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })
}

fn valid_entry(entry: &ClosedTabRecord) -> bool {
    matches!(entry.kind.as_str(), "terminal" | "file") && !normalize_path(&entry.path).is_empty()
}

fn record_at(path: &Path, mut entry: ClosedTabRecord) -> Result<ClosedTabRecord, String> {
    if !valid_entry(&entry) {
        return Err("invalid closed-tab entry".to_string());
    }
    entry.path = normalize_path(&entry.path);
    if entry.closed_at == 0 {
        entry.closed_at = now_ms();
    }
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_store(path);
    if let Some(existing) = store
        .entries
        .iter_mut()
        .find(|e| e.kind == entry.kind && e.path == entry.path)
    {
        existing.workspace_id = entry.workspace_id;
        existing.closed_at = entry.closed_at;
        entry = existing.clone();
    } else {
        entry.uses = 0;
        entry.last_used_at = 0;
        store.entries.push(entry.clone());
    }
    write_store(path, store)?;
    Ok(entry)
}

fn touch_at(path: &Path, kind: &str, raw_path: &str) -> Result<bool, String> {
    let entry_path = normalize_path(raw_path);
    if !matches!(kind, "terminal" | "file") || entry_path.is_empty() {
        return Err("invalid closed-tab entry".to_string());
    }
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_store(path);
    let Some(entry) = store
        .entries
        .iter_mut()
        .find(|e| e.kind == kind && e.path == entry_path)
    else {
        return Ok(false);
    };
    entry.uses = entry.uses.saturating_add(1);
    entry.last_used_at = now_ms();
    write_store(path, store)?;
    Ok(true)
}

fn list_at(path: &Path) -> Vec<ClosedTabRecord> {
    let mut entries = read_store(path).entries;
    entries.sort_by(by_weight);
    entries
}

#[tauri::command]
pub fn closed_tabs_list() -> Result<Vec<ClosedTabRecord>, String> {
    let path = store_path().ok_or_else(|| "closed-tabs store not initialized".to_string())?;
    Ok(list_at(&path))
}

#[tauri::command]
pub fn closed_tabs_record(entry: ClosedTabRecord) -> Result<ClosedTabRecord, String> {
    let path = store_path().ok_or_else(|| "closed-tabs store not initialized".to_string())?;
    record_at(&path, entry)
}

#[tauri::command]
pub fn closed_tabs_touch(kind: String, path: String) -> Result<bool, String> {
    let store = store_path().ok_or_else(|| "closed-tabs store not initialized".to_string())?;
    touch_at(&store, &kind, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(kind: &str, path: &str, workspace: &str, closed_at: u64) -> ClosedTabRecord {
        ClosedTabRecord {
            kind: kind.to_string(),
            path: path.to_string(),
            workspace_id: workspace.to_string(),
            closed_at,
            uses: 0,
            last_used_at: 0,
        }
    }

    #[test]
    fn record_and_list_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("closed-tabs.json");
        record_at(&path, entry("terminal", "/work/a", "ws-1", 10)).unwrap();
        record_at(&path, entry("file", "/work/a/x.ts", "ws-2", 20)).unwrap();
        let list = list_at(&path);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].path, "/work/a/x.ts");
        assert_eq!(list[0].workspace_id, "ws-2");
    }

    #[test]
    fn recording_the_same_path_updates_the_workspace_and_keeps_the_uses() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("closed-tabs.json");
        record_at(&path, entry("terminal", "/work/a", "ws-1", 10)).unwrap();
        touch_at(&path, "terminal", "/work/a").unwrap();
        touch_at(&path, "terminal", "/work/a").unwrap();
        let updated = record_at(&path, entry("terminal", "/work/a/", "ws-9", 30)).unwrap();
        assert_eq!(updated.workspace_id, "ws-9");
        assert_eq!(updated.closed_at, 30);
        assert_eq!(updated.uses, 2);
        assert_eq!(list_at(&path).len(), 1);
    }

    #[test]
    fn touch_increments_the_use_counter_and_the_last_use_stamp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("closed-tabs.json");
        record_at(&path, entry("file", "/work/a/x.ts", "ws-1", 10)).unwrap();
        assert!(touch_at(&path, "file", "/work/a/x.ts").unwrap());
        let mut list = list_at(&path);
        let row = list.remove(0);
        assert_eq!(row.uses, 1);
        assert!(row.last_used_at > 0);
        assert!(!touch_at(&path, "file", "/work/missing.ts").unwrap());
    }

    #[test]
    fn the_cap_drops_the_oldest_unused_entries_before_a_used_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("closed-tabs.json");
        record_at(&path, entry("terminal", "/kept", "ws-1", 1)).unwrap();
        for _ in 0..3 {
            touch_at(&path, "terminal", "/kept").unwrap();
        }
        for i in 0..CLOSED_TABS_CAP {
            record_at(
                &path,
                entry("file", &format!("/old/{i}.ts"), "ws-2", i as u64 + 2),
            )
            .unwrap();
        }
        let list = list_at(&path);
        assert_eq!(list.len(), CLOSED_TABS_CAP);
        assert!(list.iter().any(|e| e.path == "/kept"));
        assert!(list
            .iter()
            .any(|e| e.path == format!("/old/{}.ts", CLOSED_TABS_CAP - 1)));
    }

    #[test]
    fn a_corrupt_file_reads_as_empty_instead_of_failing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("closed-tabs.json");
        std::fs::write(&path, "{ broken").unwrap();
        assert!(list_at(&path).is_empty());
        record_at(&path, entry("terminal", "/work/a", "ws-1", 10)).unwrap();
        assert_eq!(list_at(&path).len(), 1);
    }

    #[test]
    fn an_unknown_kind_or_an_empty_path_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("closed-tabs.json");
        assert!(record_at(&path, entry("browser", "https://x", "ws-1", 10)).is_err());
        assert!(record_at(&path, entry("terminal", "   ", "ws-1", 10)).is_err());
    }
}
