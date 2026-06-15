use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Size in PHYSICAL pixels (from `inner_size()`). Position is intentionally not
/// persisted — reliable cross-monitor restore of position on macOS is unsolved.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self { width: 1280, height: 800, maximized: false }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowEntry {
    #[serde(flatten)]
    pub geometry: WindowGeometry,
    pub workspaces: Value,
    pub active_index: usize,
}

impl Default for WindowEntry {
    fn default() -> Self {
        Self {
            geometry: WindowGeometry::default(),
            workspaces: Value::Array(vec![]),
            active_index: 0,
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

pub struct WindowStateManager {
    inner: RwLock<WindowStateFile>,
    path: PathBuf,
}

impl WindowStateManager {
    pub fn new(path: PathBuf) -> Self {
        Self { inner: RwLock::new(WindowStateFile::default()), path }
    }

    /// Returns true if the file was loaded successfully.
    pub fn load(&self) -> bool {
        log::debug!("[window-state] loading from {}", self.path.display());
        let Ok(content) = std::fs::read_to_string(&self.path) else {
            log::debug!("[window-state] file not found or unreadable - starting fresh");
            return false;
        };
        let Ok(state) = serde_json::from_str::<WindowStateFile>(&content) else {
            log::warn!("[window-state] file corrupt or wrong schema - starting fresh");
            return false;
        };
        log::debug!(
            "[window-state] loaded {} window(s): {:?}",
            state.window_order.len(),
            state.window_order
        );
        *self.inner.write().expect("window state lock poisoned") = state;
        true
    }

    /// Atomic write: .tmp then rename so crashes can't corrupt the file.
    pub fn save(&self) {
        let state = self.inner.read().expect("window state lock poisoned").clone();
        let Ok(json) = serde_json::to_string_pretty(&state) else { return };
        let tmp = self.path.with_extension("json.tmp");
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
            log::debug!(
                "[window-state] saved - windows: {:?}",
                state.window_order
            );
        }
    }

    pub fn window_order(&self) -> Vec<String> {
        self.inner.read().expect("window state lock poisoned").window_order.clone()
    }

    pub fn set_focused_window(&self, label: &str) {
        self.inner.write().expect("window state lock poisoned").focused_window =
            Some(label.to_string());
    }

    pub fn get_focused_window(&self) -> Option<String> {
        self.inner.read().expect("window state lock poisoned").focused_window.clone()
    }

    pub fn get_entry(&self, label: &str) -> Option<WindowEntry> {
        self.inner.read().expect("window state lock poisoned").windows.get(label).cloned()
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
            entry.geometry = WindowGeometry { width, height, maximized };
        }
    }
}

/// Generates a window label like "w-a3f9b2c1".
/// Uses low bits of Unix timestamp XOR'd with subsecond nanos for low collision probability.
pub fn generate_window_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
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
}
