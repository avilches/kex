use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

// The palette only needs the locations used recently. The cap keeps the most used entries, not
// only the newest, so a folder returned to many times survives it.
pub const TAB_HISTORY_CAP: usize = 200;

fn store_lock() -> &'static Mutex<()> {
    STORE_LOCK.get_or_init(|| Mutex::new(()))
}

/// Must be called once in setup() before any tab-history operation.
pub fn init(data_dir: PathBuf) {
    let _ = DATA_DIR.set(data_dir);
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TabHistoryRecord {
    pub kind: String,
    pub path: String,
    pub workspace_id: String,
    pub uses: u64,
    pub last_used_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabUse {
    pub kind: String,
    pub path: String,
    pub workspace_id: String,
    pub count: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct TabHistoryStore {
    version: u32,
    entries: Vec<TabHistoryRecord>,
}

fn store_path() -> Option<PathBuf> {
    DATA_DIR.get().map(|d| d.join("tab-history.json"))
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

fn read_store(path: &Path) -> TabHistoryStore {
    let Ok(content) = std::fs::read_to_string(path) else {
        return TabHistoryStore {
            version: 1,
            entries: Vec::new(),
        };
    };
    serde_json::from_str(&content).unwrap_or(TabHistoryStore {
        version: 1,
        entries: Vec::new(),
    })
}

// Most used first, then most recently used. Keeping the same order in the file and in the
// palette makes the cap drop exactly the rows the user is least likely to pick.
fn by_weight(a: &TabHistoryRecord, b: &TabHistoryRecord) -> std::cmp::Ordering {
    b.uses
        .cmp(&a.uses)
        .then_with(|| b.last_used_at.cmp(&a.last_used_at))
        .then_with(|| a.path.cmp(&b.path))
}

fn trim(entries: &mut Vec<TabHistoryRecord>, cap: usize) {
    if entries.len() <= cap {
        return;
    }
    entries.sort_by(by_weight);
    entries.truncate(cap);
}

fn write_store(path: &Path, mut store: TabHistoryStore) -> Result<(), String> {
    trim(&mut store.entries, TAB_HISTORY_CAP);
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

fn valid_kind(kind: &str) -> bool {
    matches!(kind, "terminal" | "file")
}

fn normalized_path(kind: &str, raw_path: &str) -> Result<String, String> {
    let path = normalize_path(raw_path);
    if !valid_kind(kind) || path.is_empty() {
        return Err("invalid tab-history entry".to_string());
    }
    Ok(path)
}

fn find_mut<'a>(
    entries: &'a mut [TabHistoryRecord],
    kind: &str,
    path: &str,
) -> Option<&'a mut TabHistoryRecord> {
    entries
        .iter_mut()
        .find(|e| e.kind == kind && e.path == path)
}

// Closing only remembers where the tab was in the workspace it closed in. It never adds a use:
// the counter is kept for real focus, not for the close itself.
fn record_at(path: &Path, kind: &str, raw_path: &str, workspace_id: &str) -> Result<(), String> {
    let entry_path = normalized_path(kind, raw_path)?;
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_store(path);
    if let Some(existing) = find_mut(&mut store.entries, kind, &entry_path) {
        existing.workspace_id = workspace_id.to_string();
    } else {
        store.entries.push(TabHistoryRecord {
            kind: kind.to_string(),
            path: entry_path,
            workspace_id: workspace_id.to_string(),
            uses: 0,
            last_used_at: 0,
        });
    }
    write_store(path, store)
}

fn touch_at(path: &Path, uses: &[TabUse]) -> Result<(), String> {
    let now = now_ms();
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_store(path);
    for entry in uses {
        let entry_path = normalized_path(&entry.kind, &entry.path)?;
        let count = entry.count.max(1);
        if let Some(existing) = find_mut(&mut store.entries, &entry.kind, &entry_path) {
            existing.uses = existing.uses.saturating_add(count);
            existing.last_used_at = now;
            existing.workspace_id = entry.workspace_id.clone();
        } else {
            store.entries.push(TabHistoryRecord {
                kind: entry.kind.clone(),
                path: entry_path,
                workspace_id: entry.workspace_id.clone(),
                uses: count,
                last_used_at: now,
            });
        }
    }
    write_store(path, store)
}

fn list_at(path: &Path) -> Vec<TabHistoryRecord> {
    let mut entries = read_store(path).entries;
    entries.sort_by(by_weight);
    entries
}

// A closed tab can only be reopened while its folder or file is still there.
fn still_exists(record: &TabHistoryRecord) -> bool {
    let p = Path::new(&record.path);
    if record.kind == "terminal" {
        p.is_dir()
    } else {
        p.is_file()
    }
}

#[tauri::command]
pub fn tab_history_list() -> Result<Vec<TabHistoryRecord>, String> {
    let path = store_path().ok_or_else(|| "tab-history store not initialized".to_string())?;
    let mut entries = list_at(&path);
    entries.retain(still_exists);
    Ok(entries)
}

#[tauri::command]
pub fn tab_history_record(kind: String, path: String, workspace_id: String) -> Result<(), String> {
    let store = store_path().ok_or_else(|| "tab-history store not initialized".to_string())?;
    record_at(&store, &kind, &path, &workspace_id)
}

#[tauri::command]
pub fn tab_history_touch(entries: Vec<TabUse>) -> Result<(), String> {
    let path = store_path().ok_or_else(|| "tab-history store not initialized".to_string())?;
    touch_at(&path, &entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn use_entry(kind: &str, path: &str, workspace: &str, count: u64) -> TabUse {
        TabUse {
            kind: kind.to_string(),
            path: path.to_string(),
            workspace_id: workspace.to_string(),
            count,
        }
    }

    #[test]
    fn still_exists_checks_the_kind_of_path() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "x").unwrap();
        let record = |kind: &str, p: &Path| TabHistoryRecord {
            kind: kind.to_string(),
            path: p.to_string_lossy().into_owned(),
            workspace_id: "ws".to_string(),
            uses: 1,
            last_used_at: 1,
        };
        assert!(still_exists(&record("terminal", dir.path())));
        assert!(still_exists(&record("file", &file)));
        assert!(!still_exists(&record("terminal", &file)));
        assert!(!still_exists(&record("file", &dir.path().join("gone.txt"))));
        assert!(!still_exists(&record("terminal", &dir.path().join("gone"))));
    }

    #[test]
    fn record_and_list_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-history.json");
        record_at(&path, "terminal", "/work/a", "ws-1").unwrap();
        record_at(&path, "file", "/work/a/x.ts", "ws-2").unwrap();
        let list = list_at(&path);
        assert_eq!(list.len(), 2);
        let file = list.iter().find(|e| e.path == "/work/a/x.ts").unwrap();
        assert_eq!(file.uses, 0);
        assert_eq!(file.workspace_id, "ws-2");
    }

    #[test]
    fn touching_the_same_location_adds_uses_and_updates_the_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-history.json");
        touch_at(&path, &[use_entry("terminal", "/work/a", "ws-1", 2)]).unwrap();
        touch_at(&path, &[use_entry("terminal", "/work/a/", "ws-9", 3)]).unwrap();
        let list = list_at(&path);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].uses, 5);
        assert_eq!(list[0].workspace_id, "ws-9");
        assert!(list[0].last_used_at > 0);
    }

    #[test]
    fn closing_a_location_keeps_the_use_count_and_never_adds_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-history.json");
        touch_at(&path, &[use_entry("file", "/work/a/x.ts", "ws-1", 4)]).unwrap();
        record_at(&path, "file", "/work/a/x.ts", "ws-2").unwrap();
        let list = list_at(&path);
        assert_eq!(list[0].uses, 4);
        assert_eq!(list[0].workspace_id, "ws-2");
    }

    #[test]
    fn a_batch_touch_is_one_write_and_counts_every_entry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-history.json");
        touch_at(
            &path,
            &[
                use_entry("terminal", "/work/a", "ws-1", 2),
                use_entry("file", "/work/b.ts", "ws-2", 1),
            ],
        )
        .unwrap();
        let list = list_at(&path);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].uses, 2);
    }

    #[test]
    fn the_cap_drops_the_least_used_entries_before_a_used_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-history.json");
        touch_at(&path, &[use_entry("terminal", "/kept", "ws-1", 3)]).unwrap();
        for i in 0..TAB_HISTORY_CAP {
            touch_at(
                &path,
                &[use_entry("file", &format!("/old/{i}.ts"), "ws-2", 1)],
            )
            .unwrap();
        }
        let list = list_at(&path);
        assert_eq!(list.len(), TAB_HISTORY_CAP);
        assert!(list.iter().any(|e| e.path == "/kept"));
        assert!(list.iter().any(|e| e.path == "/old/199.ts"));
    }

    #[test]
    fn a_corrupt_file_reads_as_empty_instead_of_failing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-history.json");
        std::fs::write(&path, "{ broken").unwrap();
        assert!(list_at(&path).is_empty());
        record_at(&path, "terminal", "/work/a", "ws-1").unwrap();
        assert_eq!(list_at(&path).len(), 1);
    }

    #[test]
    fn an_unknown_kind_or_an_empty_path_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-history.json");
        assert!(record_at(&path, "browser", "https://x", "ws-1").is_err());
        assert!(record_at(&path, "terminal", "   ", "ws-1").is_err());
        assert!(touch_at(&path, &[use_entry("browser", "https://x", "ws-1", 1)]).is_err());
    }
}
