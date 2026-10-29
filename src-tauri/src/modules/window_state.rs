use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Disk schema version for the index file. Bumped when the on-disk layout
/// changes in an incompatible way (a mismatching/older file fails to parse and
/// the app starts fresh).
const INDEX_VERSION: u32 = 2;

/// Size in PHYSICAL pixels (from `inner_size()`). Position is intentionally not
/// persisted - reliable cross-monitor restore of position on macOS is unsolved.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self {
            width: 1280,
            height: 800,
            maximized: false,
        }
    }
}

/// A named group of workspaces in the WorkspaceBar, persisted per OS window.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGroupEntry {
    pub id: String,
    pub label: String,
}

/// Sidebar chrome state, persisted per OS window in the index file.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarState {
    pub open: bool,
    pub side: String,
    pub width: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowEntry {
    #[serde(flatten)]
    pub geometry: WindowGeometry,
    pub workspaces: Value,
    pub active_index: usize,
    #[serde(default)]
    pub sidebar: Option<SidebarState>,
    #[serde(default)]
    pub workspace_bar_width: Option<u32>,
    #[serde(default)]
    pub collapsed_groups: Vec<String>,
    #[serde(default)]
    pub groups: Vec<WorkspaceGroupEntry>,
}

impl Default for WindowEntry {
    fn default() -> Self {
        Self {
            geometry: WindowGeometry::default(),
            workspaces: Value::Array(vec![]),
            active_index: 0,
            sidebar: None,
            workspace_bar_width: None,
            collapsed_groups: Vec::new(),
            groups: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowStateFile {
    version: u32,
    windows: HashMap<String, WindowEntry>,
    window_order: Vec<String>,
    /// Label of the window that had OS focus when the app last closed.
    focused_window: Option<String>,
}

/// On-disk index entry: window geometry plus the ordered ids of its workspaces.
/// The heavyweight workspace bodies live in `workspaces/<id>.json` so a single
/// workspace change only rewrites one small file.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexEntry {
    #[serde(flatten)]
    geometry: WindowGeometry,
    workspace_ids: Vec<String>,
    active_index: usize,
    #[serde(default)]
    sidebar: Option<SidebarState>,
    #[serde(default)]
    workspace_bar_width: Option<u32>,
    #[serde(default)]
    collapsed_groups: Vec<String>,
    #[serde(default)]
    groups: Vec<WorkspaceGroupEntry>,
}

/// On-disk index file (`workspaces.json`). `BTreeMap` so serialization is
/// deterministic and the unchanged-write skip in `save` is reliable.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexFile {
    version: u32,
    windows: BTreeMap<String, IndexEntry>,
    window_order: Vec<String>,
    focused_window: Option<String>,
}

/// Tracks what is already on disk so `save` only rewrites what changed.
#[derive(Default)]
struct DiskCache {
    /// workspace id -> last serialized body written.
    written: HashMap<String, String>,
    /// last serialized index file written.
    written_index: Option<String>,
}

/// Workspace ids are used verbatim as filenames; reject anything that could
/// escape the workspaces directory or otherwise be an unsafe path component.
fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Atomic write: `.tmp` then rename so a crash can't leave a half-written file.
fn write_atomic(path: &Path, content: &str) -> bool {
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, content).is_err() {
        return false;
    }
    std::fs::rename(&tmp, path).is_ok()
}

/// A save that leaves this many workspaces or fewer on disk, out of `BACKUP_MIN_BEFORE` or more,
/// is taken for a failed load rather than a user closing tabs, and the previous state is copied
/// aside first.
const BACKUP_MIN_BEFORE: usize = 3;
const BACKUPS_KEPT: usize = 3;

fn drops_most_workspaces(before: usize, after: usize) -> bool {
    before >= BACKUP_MIN_BEFORE && after * 2 <= before
}

/// Ids a save would write: the safe, string ids of every window's workspaces.
fn incoming_ids(state: &WindowStateFile) -> HashSet<String> {
    state
        .windows
        .values()
        .filter_map(|e| e.workspaces.as_array())
        .flatten()
        .filter_map(|b| b.get("id").and_then(Value::as_str))
        .filter(|id| is_safe_id(id))
        .map(str::to_string)
        .collect()
}

fn collect_terminal_tab_ids(value: &Value, out: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            if map.get("kind").and_then(Value::as_str) == Some("terminal") {
                if let Some(id) = map.get("id").and_then(Value::as_str) {
                    out.insert(id.to_string());
                }
            }
            map.values().for_each(|v| collect_terminal_tab_ids(v, out));
        }
        Value::Array(items) => items.iter().for_each(|v| collect_terminal_tab_ids(v, out)),
        _ => {}
    }
}

pub struct WindowStateManager {
    inner: RwLock<WindowStateFile>,
    /// Path of the index file (`workspaces.json`).
    path: PathBuf,
    disk: Mutex<DiskCache>,
}

impl WindowStateManager {
    pub fn new(path: PathBuf) -> Self {
        Self {
            inner: RwLock::new(WindowStateFile::default()),
            path,
            disk: Mutex::new(DiskCache::default()),
        }
    }

    /// Directory holding the per-workspace bodies, alongside the index file.
    fn workspaces_dir(&self) -> PathBuf {
        self.path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default()
            .join("workspaces")
    }

    /// Delete any `*.json` / leftover `*.tmp` in the workspaces dir whose id is
    /// not referenced by the index. Recovers space after crashes mid-write.
    fn gc_orphans(ws_dir: &Path, referenced: &HashSet<String>) {
        let Ok(rd) = std::fs::read_dir(ws_dir) else {
            return;
        };
        for entry in rd.flatten() {
            let path = entry.path();
            let ext = path.extension().and_then(|e| e.to_str());
            if ext == Some("tmp") {
                let _ = std::fs::remove_file(&path);
                continue;
            }
            if ext != Some("json") {
                continue;
            }
            let keep = path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|stem| referenced.contains(stem))
                .unwrap_or(false);
            if !keep {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    /// Directory of the snapshots taken before a save or a cleanup could destroy most of the state.
    fn backup_root(&self) -> PathBuf {
        self.path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default()
            .join("workspaces-backup")
    }

    /// Copies the index and every body on disk into a new `workspaces-backup/<millis>/` and
    /// drops all but the newest `BACKUPS_KEPT`. Best effort: a failure is logged, never fatal.
    fn snapshot_to_backup(&self, reason: &str) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let root = self.backup_root();
        let dest = root.join(format!("{millis:020}"));
        let ws_dest = dest.join("workspaces");
        if std::fs::create_dir_all(&ws_dest).is_err() {
            log::warn!("[window-state] could not create backup dir {}", dest.display());
            return;
        }
        let _ = std::fs::copy(&self.path, dest.join("workspaces.json"));
        if let Ok(rd) = std::fs::read_dir(self.workspaces_dir()) {
            for entry in rd.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if let Some(name) = path.file_name() {
                    let _ = std::fs::copy(&path, ws_dest.join(name));
                }
            }
        }
        log::warn!("[window-state] backed up the previous state to {} ({reason})", dest.display());
        let Ok(rd) = std::fs::read_dir(&root) else {
            return;
        };
        let mut dirs: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
        dirs.sort();
        let excess = dirs.len().saturating_sub(BACKUPS_KEPT);
        for old in dirs.into_iter().take(excess) {
            let _ = std::fs::remove_dir_all(old);
        }
    }

    /// Returns true if the index was loaded successfully. Reconstructs each
    /// window's full workspace array from `workspaces/<id>.json`, and deletes
    /// any orphan body files no longer referenced.
    pub fn load(&self) -> bool {
        log::debug!("[window-state] loading from {}", self.path.display());
        let ws_dir = self.workspaces_dir();
        let Ok(content) = std::fs::read_to_string(&self.path) else {
            log::debug!("[window-state] index not found or unreadable - starting fresh");
            Self::gc_orphans(&ws_dir, &HashSet::new());
            return false;
        };
        let Ok(index) = serde_json::from_str::<IndexFile>(&content) else {
            log::warn!("[window-state] index corrupt or wrong schema - starting fresh");
            self.snapshot_to_backup("index corrupt or wrong schema");
            Self::gc_orphans(&ws_dir, &HashSet::new());
            return false;
        };

        let mut windows: HashMap<String, WindowEntry> = HashMap::new();
        let mut referenced: HashSet<String> = HashSet::new();
        let mut written: HashMap<String, String> = HashMap::new();
        for (label, ie) in &index.windows {
            let mut bodies: Vec<Value> = Vec::new();
            for id in &ie.workspace_ids {
                if !is_safe_id(id) {
                    log::warn!("[window-state] skipping unsafe workspace id: {id:?}");
                    continue;
                }
                let file = ws_dir.join(format!("{id}.json"));
                let Ok(raw) = std::fs::read_to_string(&file) else {
                    log::warn!("[window-state] workspace body missing for id {id}");
                    continue;
                };
                let Ok(body) = serde_json::from_str::<Value>(&raw) else {
                    log::warn!("[window-state] workspace body corrupt for id {id}");
                    continue;
                };
                referenced.insert(id.clone());
                if let Ok(norm) = serde_json::to_string_pretty(&body) {
                    written.insert(id.clone(), norm);
                }
                bodies.push(body);
            }
            windows.insert(
                label.clone(),
                WindowEntry {
                    geometry: ie.geometry.clone(),
                    workspaces: Value::Array(bodies),
                    active_index: ie.active_index,
                    sidebar: ie.sidebar.clone(),
                    workspace_bar_width: ie.workspace_bar_width,
                    collapsed_groups: ie.collapsed_groups.clone(),
                    groups: ie.groups.clone(),
                },
            );
        }

        Self::gc_orphans(&ws_dir, &referenced);

        let state = WindowStateFile {
            version: index.version,
            windows,
            window_order: index.window_order,
            focused_window: index.focused_window,
        };
        log::debug!(
            "[window-state] loaded {} window(s): {:?}",
            state.window_order.len(),
            state.window_order
        );
        {
            let mut disk = self.disk.lock().expect("disk cache lock poisoned");
            disk.written = written;
            disk.written_index = Some(content);
        }
        *self.inner.write().expect("window state lock poisoned") = state;
        true
    }

    /// Writes only what changed: a `workspaces/<id>.json` per modified workspace
    /// plus the small index file, then deletes bodies no longer referenced.
    /// Each file is written atomically (`.tmp` then rename).
    pub fn save(&self) {
        let state = self
            .inner
            .read()
            .expect("window state lock poisoned")
            .clone();
        let ws_dir = self.workspaces_dir();
        let _ = std::fs::create_dir_all(&ws_dir);

        let mut disk = self.disk.lock().expect("disk cache lock poisoned");

        if drops_most_workspaces(disk.written.len(), incoming_ids(&state).len()) {
            self.snapshot_to_backup(&format!(
                "save would drop {} workspace(s) to {}",
                disk.written.len(),
                incoming_ids(&state).len()
            ));
        }

        let mut referenced: HashSet<String> = HashSet::new();
        let mut index_windows: BTreeMap<String, IndexEntry> = BTreeMap::new();
        for (label, entry) in &state.windows {
            let mut ids: Vec<String> = Vec::new();
            if let Some(bodies) = entry.workspaces.as_array() {
                for body in bodies {
                    let Some(id) = body.get("id").and_then(Value::as_str) else {
                        log::warn!("[window-state] skipping workspace without string id");
                        continue;
                    };
                    if !is_safe_id(id) {
                        log::warn!("[window-state] skipping unsafe workspace id: {id:?}");
                        continue;
                    }
                    ids.push(id.to_string());
                    referenced.insert(id.to_string());
                    let Ok(json) = serde_json::to_string_pretty(body) else {
                        continue;
                    };
                    if disk.written.get(id) != Some(&json)
                        && write_atomic(&ws_dir.join(format!("{id}.json")), &json)
                    {
                        disk.written.insert(id.to_string(), json);
                    }
                }
            }
            index_windows.insert(
                label.clone(),
                IndexEntry {
                    geometry: entry.geometry.clone(),
                    workspace_ids: ids,
                    active_index: entry.active_index,
                    sidebar: entry.sidebar.clone(),
                    workspace_bar_width: entry.workspace_bar_width,
                    collapsed_groups: entry.collapsed_groups.clone(),
                    groups: entry.groups.clone(),
                },
            );
        }

        let index = IndexFile {
            version: INDEX_VERSION,
            windows: index_windows,
            window_order: state.window_order.clone(),
            focused_window: state.focused_window.clone(),
        };
        if let Ok(index_json) = serde_json::to_string_pretty(&index) {
            if disk.written_index.as_deref() != Some(index_json.as_str())
                && write_atomic(&self.path, &index_json)
            {
                disk.written_index = Some(index_json);
            }
        }

        // Drop bodies that are no longer referenced by any window.
        let stale: Vec<String> = disk
            .written
            .keys()
            .filter(|id| !referenced.contains(*id))
            .cloned()
            .collect();
        for id in stale {
            let _ = std::fs::remove_file(ws_dir.join(format!("{id}.json")));
            disk.written.remove(&id);
        }

        log::debug!("[window-state] saved - windows: {:?}", state.window_order);
    }

    /// Terminal tab ids across every open window, so a caller can tell a tab that
    /// lives in another window from one that no longer exists anywhere.
    pub fn terminal_tab_ids(&self) -> HashSet<String> {
        let state = self.inner.read().expect("window state lock poisoned");
        let mut ids = HashSet::new();
        for entry in state.windows.values() {
            collect_terminal_tab_ids(&entry.workspaces, &mut ids);
        }
        ids
    }

    pub fn window_order(&self) -> Vec<String> {
        self.inner
            .read()
            .expect("window state lock poisoned")
            .window_order
            .clone()
    }

    pub fn set_focused_window(&self, label: &str) {
        self.inner
            .write()
            .expect("window state lock poisoned")
            .focused_window = Some(label.to_string());
    }

    pub fn get_focused_window(&self) -> Option<String> {
        self.inner
            .read()
            .expect("window state lock poisoned")
            .focused_window
            .clone()
    }

    pub fn get_entry(&self, label: &str) -> Option<WindowEntry> {
        self.inner
            .read()
            .expect("window state lock poisoned")
            .windows
            .get(label)
            .cloned()
    }

    pub fn add_window(&self, label: String) {
        log::debug!("[window-state] add_window: {label}");
        let mut state = self.inner.write().expect("window state lock poisoned");
        state.windows.entry(label.clone()).or_default();
        if !state.window_order.contains(&label) {
            state.window_order.push(label);
        }
    }

    pub fn remove_window(&self, label: &str) {
        log::debug!("[window-state] remove_window: {label}");
        let mut state = self.inner.write().expect("window state lock poisoned");
        state.windows.remove(label);
        state.window_order.retain(|l| l != label);
    }

    pub fn update_workspace(&self, label: &str, workspaces: Value, active_index: usize) {
        let mut state = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = state.windows.get_mut(label) {
            let ws_count = entry.workspaces.as_array().map(|a| a.len()).unwrap_or(0);
            log::debug!("[window-state] update_workspace: {label} - {ws_count} workspace(s), activeIndex={active_index}");
            entry.workspaces = workspaces;
            entry.active_index = active_index;
        } else {
            log::warn!("[window-state] update_workspace: label '{label}' not found in state");
        }
    }

    pub fn update_geometry(&self, label: &str, width: u32, height: u32, maximized: bool) {
        let mut state = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = state.windows.get_mut(label) {
            entry.geometry = WindowGeometry {
                width,
                height,
                maximized,
            };
        }
    }

    pub fn update_sidebar(&self, label: &str, state: SidebarState) {
        let side = match state.side.as_str() {
            "left" | "right" => state.side,
            _ => "left".to_string(),
        };
        let width = state.width.clamp(12, 70);
        let sanitized = SidebarState {
            open: state.open,
            side,
            width,
        };
        let mut guard = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = guard.windows.get_mut(label) {
            entry.sidebar = Some(sanitized);
        } else {
            log::warn!("[window-state] update_sidebar: label '{label}' not found in state");
        }
    }

    pub fn update_workspace_bar_width(&self, label: &str, width: u32) {
        let mut inner = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = inner.windows.get_mut(label) {
            entry.workspace_bar_width = Some(width);
        }
    }

    pub fn update_collapsed_groups(&self, label: &str, ids: Vec<String>) {
        let mut inner = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = inner.windows.get_mut(label) {
            entry.collapsed_groups = ids;
        }
    }

    pub fn update_groups(&self, label: &str, groups: Vec<WorkspaceGroupEntry>) {
        let mut inner = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = inner.windows.get_mut(label) {
            entry.groups = groups;
        }
    }
}

/// Generates a window label like "w-a3f9b2c1".
/// Uses low bits of Unix timestamp XOR'd with subsecond nanos for low collision probability.
pub fn generate_window_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let v = (d.as_secs() as u32) ^ d.subsec_nanos();
    format!("w-{:08x}", v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn load_missing_file_returns_false_and_empty_order() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path);
        assert!(!mgr.load());
        assert!(mgr.window_order().is_empty());
    }

    #[test]
    fn add_and_remove_window() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-aabbccdd".to_string());
        assert_eq!(mgr.window_order(), vec!["w-aabbccdd"]);
        mgr.remove_window("w-aabbccdd");
        assert!(mgr.window_order().is_empty());
        assert!(mgr.get_entry("w-aabbccdd").is_none());
    }

    #[test]
    fn add_window_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-aabbccdd".to_string());
        mgr.add_window("w-aabbccdd".to_string());
        assert_eq!(mgr.window_order().len(), 1);
    }

    #[test]
    fn save_and_reload() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-aabbccdd".to_string());
        mgr.update_workspace("w-aabbccdd", serde_json::json!([{"id": "ws1"}]), 2);
        mgr.save();

        let mgr2 = WindowStateManager::new(path);
        assert!(mgr2.load());
        let entry = mgr2.get_entry("w-aabbccdd").unwrap();
        assert_eq!(entry.workspaces, serde_json::json!([{"id": "ws1"}]));
        assert_eq!(entry.active_index, 2);
        assert_eq!(mgr2.window_order(), vec!["w-aabbccdd"]);
    }

    #[test]
    fn load_corrupt_file_returns_false_and_empty_order() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        std::fs::write(&path, "not valid json").unwrap();
        let mgr = WindowStateManager::new(path);
        assert!(!mgr.load());
        assert!(mgr.window_order().is_empty());
    }

    #[test]
    fn update_geometry_stores_values() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-aabbccdd".to_string());
        mgr.update_geometry("w-aabbccdd", 1280, 800, false);
        let entry = mgr.get_entry("w-aabbccdd").unwrap();
        assert_eq!(entry.geometry.width, 1280);
        assert_eq!(entry.geometry.height, 800);
        assert!(!entry.geometry.maximized);
    }

    #[test]
    fn update_geometry_on_unknown_label_is_noop() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.update_geometry("w-ghost", 100, 100, false);
        assert!(mgr.get_entry("w-ghost").is_none());
    }

    #[test]
    fn save_writes_one_file_per_workspace_and_a_lean_index() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-1".to_string());
        mgr.update_workspace(
            "w-1",
            serde_json::json!([{"id": "ws-aaa", "title": "A"}, {"id": "ws-bbb", "title": "B"}]),
            1,
        );
        mgr.save();

        let ws_dir = dir.path().join("workspaces");
        assert!(ws_dir.join("ws-aaa.json").exists());
        assert!(ws_dir.join("ws-bbb.json").exists());

        // The index references ids only; bodies are not inlined.
        let index = std::fs::read_to_string(&path).unwrap();
        assert!(index.contains("ws-aaa"));
        assert!(index.contains("workspaceIds"));
        assert!(!index.contains("\"title\""));
    }

    #[test]
    fn reload_reconstructs_full_workspaces() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-1".to_string());
        let body = serde_json::json!([{"id": "ws-aaa", "title": "A", "paneTree": {"k": 1}}]);
        mgr.update_workspace("w-1", body.clone(), 0);
        mgr.save();

        let mgr2 = WindowStateManager::new(path);
        assert!(mgr2.load());
        assert_eq!(mgr2.get_entry("w-1").unwrap().workspaces, body);
    }

    #[test]
    fn boot_gc_removes_unreferenced_body_files() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-1".to_string());
        mgr.update_workspace("w-1", serde_json::json!([{"id": "ws-keep"}]), 0);
        mgr.save();

        // Simulate a crash leaving an orphan body behind.
        let ws_dir = dir.path().join("workspaces");
        std::fs::write(ws_dir.join("ws-orphan.json"), "{\"id\":\"ws-orphan\"}").unwrap();

        let mgr2 = WindowStateManager::new(path);
        assert!(mgr2.load());
        assert!(ws_dir.join("ws-keep.json").exists());
        assert!(!ws_dir.join("ws-orphan.json").exists());
    }

    #[test]
    fn save_deletes_body_when_workspace_is_removed() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let ws_dir = dir.path().join("workspaces");
        let mgr = WindowStateManager::new(path);
        mgr.add_window("w-1".to_string());
        mgr.update_workspace(
            "w-1",
            serde_json::json!([{"id": "ws-aaa"}, {"id": "ws-bbb"}]),
            0,
        );
        mgr.save();
        assert!(ws_dir.join("ws-bbb.json").exists());

        mgr.update_workspace("w-1", serde_json::json!([{"id": "ws-aaa"}]), 0);
        mgr.save();
        assert!(ws_dir.join("ws-aaa.json").exists());
        assert!(!ws_dir.join("ws-bbb.json").exists());
    }

    fn backups(dir: &Path) -> Vec<PathBuf> {
        let root = dir.join("workspaces-backup");
        let mut v: Vec<PathBuf> = std::fs::read_dir(root)
            .map(|rd| rd.flatten().map(|e| e.path()).collect())
            .unwrap_or_default();
        v.sort();
        v
    }

    fn mgr_with_workspaces(dir: &TempDir, ids: &[&str]) -> WindowStateManager {
        let mgr = WindowStateManager::new(dir.path().join("workspaces.json"));
        mgr.add_window("w-1".to_string());
        let bodies: Vec<Value> = ids.iter().map(|id| serde_json::json!({ "id": id })).collect();
        mgr.update_workspace("w-1", Value::Array(bodies), 0);
        mgr.save();
        mgr
    }

    #[test]
    fn save_that_drops_most_workspaces_backs_up_the_previous_state_first() {
        let dir = TempDir::new().unwrap();
        let mgr = mgr_with_workspaces(&dir, &["ws-a", "ws-b", "ws-c", "ws-d"]);
        assert!(backups(dir.path()).is_empty());

        mgr.update_workspace("w-1", serde_json::json!([{"id": "ws-fresh"}]), 0);
        mgr.save();

        let b = backups(dir.path());
        assert_eq!(b.len(), 1);
        for id in ["ws-a", "ws-b", "ws-c", "ws-d"] {
            assert!(b[0].join("workspaces").join(format!("{id}.json")).exists(), "{id}");
        }
        let index: Value =
            serde_json::from_str(&std::fs::read_to_string(b[0].join("workspaces.json")).unwrap()).unwrap();
        assert_eq!(index["windows"]["w-1"]["workspaceIds"].as_array().unwrap().len(), 4);
        assert!(!dir.path().join("workspaces/ws-a.json").exists());
    }

    #[test]
    fn closing_one_workspace_at_a_time_takes_no_backup() {
        let dir = TempDir::new().unwrap();
        let mgr = mgr_with_workspaces(&dir, &["ws-a", "ws-b", "ws-c", "ws-d"]);
        mgr.update_workspace("w-1", serde_json::json!([{"id": "ws-a"}, {"id": "ws-b"}, {"id": "ws-c"}]), 0);
        mgr.save();
        assert!(backups(dir.path()).is_empty());
    }

    #[test]
    fn a_small_state_never_takes_a_backup() {
        let dir = TempDir::new().unwrap();
        let mgr = mgr_with_workspaces(&dir, &["ws-a", "ws-b"]);
        mgr.update_workspace("w-1", serde_json::json!([{"id": "ws-a"}]), 0);
        mgr.save();
        assert!(backups(dir.path()).is_empty());
    }

    #[test]
    fn only_the_newest_backups_are_kept() {
        let dir = TempDir::new().unwrap();
        let mgr = mgr_with_workspaces(&dir, &["ws-a", "ws-b", "ws-c", "ws-d"]);
        for _ in 0..(BACKUPS_KEPT + 2) {
            mgr.update_workspace(
                "w-1",
                serde_json::json!([{"id": "ws-a"}, {"id": "ws-b"}, {"id": "ws-c"}, {"id": "ws-d"}]),
                0,
            );
            mgr.save();
            mgr.update_workspace("w-1", serde_json::json!([{"id": "ws-a"}]), 0);
            mgr.save();
            std::thread::sleep(std::time::Duration::from_millis(3));
        }
        assert_eq!(backups(dir.path()).len(), BACKUPS_KEPT);
    }

    #[test]
    fn a_corrupt_index_backs_up_the_bodies_before_the_cleanup_deletes_them() {
        let dir = TempDir::new().unwrap();
        let _ = mgr_with_workspaces(&dir, &["ws-a", "ws-b", "ws-c"]);
        std::fs::write(dir.path().join("workspaces.json"), "{ not json").unwrap();

        let mgr = WindowStateManager::new(dir.path().join("workspaces.json"));
        assert!(!mgr.load());

        let b = backups(dir.path());
        assert_eq!(b.len(), 1);
        assert!(b[0].join("workspaces/ws-b.json").exists());
        assert!(!dir.path().join("workspaces/ws-b.json").exists());
    }

    #[test]
    fn load_skips_missing_and_corrupt_bodies() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-1".to_string());
        mgr.update_workspace(
            "w-1",
            serde_json::json!([{"id": "ws-good"}, {"id": "ws-bad"}]),
            0,
        );
        mgr.save();

        let ws_dir = dir.path().join("workspaces");
        std::fs::write(ws_dir.join("ws-bad.json"), "{ not json").unwrap();

        let mgr2 = WindowStateManager::new(path);
        assert!(mgr2.load());
        let entry = mgr2.get_entry("w-1").unwrap();
        assert_eq!(entry.workspaces, serde_json::json!([{"id": "ws-good"}]));
    }

    #[test]
    fn save_rejects_unsafe_workspace_ids() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let ws_dir = dir.path().join("workspaces");
        let mgr = WindowStateManager::new(path);
        mgr.add_window("w-1".to_string());
        mgr.update_workspace(
            "w-1",
            serde_json::json!([{"id": "../escape"}, {"id": "ws-ok"}]),
            0,
        );
        mgr.save();
        assert!(ws_dir.join("ws-ok.json").exists());
        // No traversal: nothing written outside the workspaces dir.
        assert!(!dir.path().join("escape.json").exists());
    }

    #[test]
    fn old_monolithic_format_starts_fresh() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        // Pre-split file: bodies inlined under `workspaces`, no `workspaceIds`.
        let legacy = serde_json::json!({
            "version": 0,
            "windows": { "w-1": { "width": 1280, "height": 800, "maximized": false,
                "workspaces": [{"id": "ws-x"}], "activeIndex": 0 } },
            "windowOrder": ["w-1"],
            "focusedWindow": "w-1"
        });
        std::fs::write(&path, serde_json::to_string(&legacy).unwrap()).unwrap();
        let mgr = WindowStateManager::new(path);
        assert!(!mgr.load());
        assert!(mgr.window_order().is_empty());
    }

    #[test]
    fn sidebar_round_trips_some_and_none() {
        let with = WindowEntry {
            sidebar: Some(SidebarState {
                open: false,
                side: "right".to_string(),
                width: 25,
            }),
            ..WindowEntry::default()
        };
        let json = serde_json::to_string(&with).unwrap();
        assert!(json.contains("sidebar"));
        let back: WindowEntry = serde_json::from_str(&json).unwrap();
        let sb = back.sidebar.unwrap();
        assert!(!sb.open);
        assert_eq!(sb.side, "right");
        assert_eq!(sb.width, 25);

        let without = WindowEntry::default();
        let json = serde_json::to_string(&without).unwrap();
        let back: WindowEntry = serde_json::from_str(&json).unwrap();
        assert!(back.sidebar.is_none());
    }

    #[test]
    fn sidebar_with_legacy_view_key_still_deserializes() {
        let sb: SidebarState =
            serde_json::from_str(r#"{"open":true,"view":"git","side":"left","width":20}"#).unwrap();
        assert!(sb.open);
        assert_eq!(sb.width, 20);
    }

    #[test]
    fn index_without_sidebar_field_deserializes_to_none() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let index = serde_json::json!({
            "version": INDEX_VERSION,
            "windows": { "w-1": {
                "width": 1280, "height": 800, "maximized": false,
                "workspaceIds": [], "activeIndex": 0
            } },
            "windowOrder": ["w-1"],
            "focusedWindow": "w-1"
        });
        std::fs::write(&path, serde_json::to_string(&index).unwrap()).unwrap();
        let mgr = WindowStateManager::new(path);
        assert!(mgr.load());
        assert!(mgr.get_entry("w-1").unwrap().sidebar.is_none());
    }

    #[test]
    fn update_sidebar_persists_and_reloads() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-1".to_string());
        mgr.update_sidebar(
            "w-1",
            SidebarState {
                open: false,
                side: "right".to_string(),
                width: 30,
            },
        );
        mgr.save();

        let mgr2 = WindowStateManager::new(path);
        assert!(mgr2.load());
        let sb = mgr2.get_entry("w-1").unwrap().sidebar.unwrap();
        assert!(!sb.open);
        assert_eq!(sb.side, "right");
        assert_eq!(sb.width, 30);
    }

    #[test]
    fn update_sidebar_sanitizes_invalid_values() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-1".to_string());
        mgr.update_sidebar(
            "w-1",
            SidebarState {
                open: true,
                side: "up".to_string(),
                width: 5,
            },
        );
        let sb = mgr.get_entry("w-1").unwrap().sidebar.unwrap();
        assert_eq!(sb.side, "left");
        assert_eq!(sb.width, 12);
    }

    #[test]
    fn update_sidebar_on_unknown_label_is_noop() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.update_sidebar(
            "w-ghost",
            SidebarState {
                open: true,
                side: "left".to_string(),
                width: 20,
            },
        );
        assert!(mgr.get_entry("w-ghost").is_none());
    }

    #[test]
    fn update_groups_persists_and_reloads() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-1".to_string());
        mgr.update_groups(
            "w-1",
            vec![
                WorkspaceGroupEntry {
                    id: "grp-a".to_string(),
                    label: "Group A".to_string(),
                },
                WorkspaceGroupEntry {
                    id: "grp-b".to_string(),
                    label: "Group B".to_string(),
                },
            ],
        );
        mgr.save();

        let mgr2 = WindowStateManager::new(path);
        assert!(mgr2.load());
        let groups = mgr2.get_entry("w-1").unwrap().groups;
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].id, "grp-a");
        assert_eq!(groups[0].label, "Group A");
        assert_eq!(groups[1].id, "grp-b");
    }

    #[test]
    fn update_groups_on_unknown_label_is_noop() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.update_groups(
            "w-ghost",
            vec![WorkspaceGroupEntry {
                id: "grp-a".to_string(),
                label: "A".to_string(),
            }],
        );
        assert!(mgr.get_entry("w-ghost").is_none());
    }

    #[test]
    fn entry_without_groups_field_deserializes_to_empty() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let index = serde_json::json!({
            "version": INDEX_VERSION,
            "windows": { "w-1": {
                "width": 1280, "height": 800, "maximized": false,
                "workspaceIds": [], "activeIndex": 0
            } },
            "windowOrder": ["w-1"],
            "focusedWindow": "w-1"
        });
        std::fs::write(&path, serde_json::to_string(&index).unwrap()).unwrap();
        let mgr = WindowStateManager::new(path);
        assert!(mgr.load());
        assert!(mgr.get_entry("w-1").unwrap().groups.is_empty());
    }

    fn ws_with_tabs(tabs: &[(&str, &str)]) -> Value {
        let tabs: Vec<Value> = tabs
            .iter()
            .map(|(id, kind)| serde_json::json!({"id": id, "kind": kind}))
            .collect();
        serde_json::json!([{
            "id": "ws-1",
            "paneTree": {"type": "leaf", "pane": {"id": "pane-1", "tabs": tabs}}
        }])
    }

    #[test]
    fn terminal_tab_ids_is_the_union_of_every_window() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-main".to_string());
        mgr.add_window("w-small".to_string());
        mgr.update_workspace(
            "w-main",
            ws_with_tabs(&[("tab-a", "terminal"), ("tab-b", "editor")]),
            0,
        );
        mgr.update_workspace("w-small", ws_with_tabs(&[("tab-c", "terminal")]), 0);

        let ids = mgr.terminal_tab_ids();
        assert_eq!(
            ids,
            HashSet::from(["tab-a".to_string(), "tab-c".to_string()])
        );
    }

    #[test]
    fn terminal_tab_ids_survives_an_empty_window() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-main".to_string());
        mgr.add_window("w-empty".to_string());
        mgr.update_workspace("w-main", ws_with_tabs(&[("tab-a", "terminal")]), 0);

        assert_eq!(mgr.terminal_tab_ids(), HashSet::from(["tab-a".to_string()]));
    }

    #[test]
    fn terminal_tab_ids_includes_hibernated_tabs() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-main".to_string());
        let mut ws = ws_with_tabs(&[("tab-a", "terminal"), ("tab-b", "terminal")]);
        ws[0]["paneTree"]["pane"]["tabs"][0]["hibernation"] = serde_json::json!({"at": 1});
        mgr.update_workspace("w-main", ws, 0);

        let known = mgr.terminal_tab_ids();
        assert_eq!(
            known,
            HashSet::from(["tab-a".to_string(), "tab-b".to_string()])
        );
    }
}
