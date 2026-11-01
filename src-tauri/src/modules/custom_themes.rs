use serde_json::Value;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "kex-custom-themes.json";
const KEY: &str = "themes";
const CHANGED_EVENT: &str = "kex://custom-themes-changed";
const THEME_EDIT_EVENT: &str = "kex://theme-edit";

// One lock for the whole read-modify-write: the webviews each hold their own copy of the list,
// so only the process-wide store can serialise writers coming from different windows.
static LIST_LOCK: Mutex<()> = Mutex::new(());

fn id_of(theme: &Value) -> Option<&str> {
    theme.get("id").and_then(Value::as_str)
}

/// Replaces the entry with the same id, or appends. Entries without an id are dropped.
pub(crate) fn upsert(list: Vec<Value>, theme: Value) -> Vec<Value> {
    let Some(id) = id_of(&theme).map(str::to_owned) else {
        return list;
    };
    let mut next: Vec<Value> = list
        .into_iter()
        .filter(|t| id_of(t) != Some(id.as_str()))
        .collect();
    next.push(theme);
    next
}

/// Returns the list without `id`, or `None` when it was not there.
pub(crate) fn remove(list: Vec<Value>, id: &str) -> Option<Vec<Value>> {
    let before = list.len();
    let next: Vec<Value> = list.into_iter().filter(|t| id_of(t) != Some(id)).collect();
    (next.len() != before).then_some(next)
}

fn update(
    app: &tauri::AppHandle,
    f: impl FnOnce(Vec<Value>) -> Option<Vec<Value>>,
) -> Result<(), String> {
    let _guard = LIST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let current = match store.get(KEY) {
        Some(Value::Array(a)) => a,
        _ => Vec::new(),
    };
    let Some(next) = f(current) else {
        return Ok(());
    };
    store.set(KEY, Value::Array(next));
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(())
}

#[tauri::command(async)]
pub fn custom_theme_save(app: tauri::AppHandle, theme: Value) -> Result<(), String> {
    if id_of(&theme).is_none() {
        return Err("theme has no id".into());
    }
    update(&app, |list| Some(upsert(list, theme)))
}

#[tauri::command(async)]
pub fn custom_theme_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    update(&app, |list| remove(list, &id))
}

/// Settings asks for a theme to be created or edited; only one main window must act on it, so
/// the request goes to the focused one (any main window when none is known).
#[tauri::command]
pub fn request_theme_edit(app: tauri::AppHandle, req: Value) -> Result<(), String> {
    let focused = app
        .state::<crate::modules::window_state::WindowStateManager>()
        .get_focused_window()
        .filter(|l| app.get_webview_window(l).is_some());
    let target = focused.or_else(|| {
        app.webview_windows()
            .into_keys()
            .filter(|l| l.starts_with("w-"))
            .min()
    });
    let label = target.ok_or("no main window to edit the theme in")?;
    app.emit_to(label.as_str(), THEME_EDIT_EVENT, req)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn upsert_keeps_concurrent_entries() {
        let a = upsert(vec![], json!({"id": "t1"}));
        let b = upsert(a, json!({"id": "t2"}));
        assert_eq!(b.len(), 2);
    }

    #[test]
    fn upsert_replaces_same_id() {
        let list = upsert(vec![json!({"id": "t1", "name": "old"})], json!({"id": "t1", "name": "new"}));
        assert_eq!(list, vec![json!({"id": "t1", "name": "new"})]);
    }

    #[test]
    fn upsert_ignores_theme_without_id() {
        let list = upsert(vec![json!({"id": "t1"})], json!({"name": "x"}));
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn remove_reports_missing_id() {
        assert!(remove(vec![json!({"id": "t1"})], "nope").is_none());
        assert_eq!(remove(vec![json!({"id": "t1"})], "t1"), Some(vec![]));
    }
}
