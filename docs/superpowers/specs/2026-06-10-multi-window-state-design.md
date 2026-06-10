# Multi-window state design

**Date:** 2026-06-10
**Status:** Approved

## Problem

The current window system has several flaws:

- The first window is hardcoded as `"main"` via `tauri.conf.json`. Additional windows get
  `"main-<hex-nanos>"` labels, making the first window special with no semantic reason.
- `workspace-state.json` stores a single global `{ workspaces, activeIndex }` object. All windows
  share it; the last to close wins and the rest lose their state.
- `.window-state.json` (from `tauri-plugin-window-state`) accumulates stale entries for closed
  windows indefinitely.
- On macOS, the settings lifecycle listener is hardcoded to `"main"`, so closing any other window
  does not close settings.

## Goal

- All windows are equal. No special `"main"`.
- One unified `terax-windows.json` replaces both `.window-state.json` and `workspace-state.json`.
- On restart, all previously open windows are restored with their geometry and workspaces.
- Settings is a single global window; it closes when the last main window closes.
- No backward compatibility with old state files.

---

## Data model -- `terax-windows.json`

Stored in the app data directory (`~/Library/Application Support/app.crynta.terax/` on macOS).

```json
{
  "version": 1,
  "windows": {
    "w-a3f9b2c1": {
      "x": 458,
      "y": 70,
      "width": 1755,
      "height": 1218,
      "maximized": false,
      "workspaces": [...],
      "active_index": 0
    },
    "w-d81f44e2": {
      "x": 100,
      "y": 50,
      "width": 1280,
      "height": 800,
      "maximized": false,
      "workspaces": [...],
      "active_index": 1
    }
  },
  "window_order": ["w-a3f9b2c1", "w-d81f44e2"]
}
```

- `version`: enables future schema migrations.
- `window_order`: preserves the order windows were opened so they reopen in the same order.
- Window IDs use the format `"w-<8 hex chars>"` (first 4 bytes of a UUIDv4). Unique enough for a
  handful of windows.
- Geometry (`x/y/width/height/maximized`) is saved when each window closes.
- Workspaces are updated debounced (800ms) from the frontend via IPC.
- If the file is missing or corrupt: open one blank window, no migration attempted.

---

## Rust architecture -- `WindowStateManager`

New module: `src-tauri/src/modules/window_state/mod.rs`.

Registered as managed Tauri state via `app.manage(WindowStateManager::new(path))`.

```rust
pub struct WindowStateManager {
    inner: RwLock<WindowStateFile>,
    path: PathBuf,
}
```

### Methods

| Method | Description |
|--------|-------------|
| `load()` | Reads `terax-windows.json` on startup. Returns empty state if missing or corrupt. |
| `save()` | Atomic write: write to `.tmp` then rename, preventing corruption on crash. |
| `update_workspace(label, workspaces, active_index)` | Called from IPC when frontend workspaces change. |
| `update_geometry(label, x, y, width, height, maximized)` | Called on `WindowEvent::CloseRequested` to capture final geometry. |
| `add_window(label)` | Registers a new window with default geometry. |
| `remove_window(label)` | Removes window from state. Called on intentional close so it does not reopen next session. |

### IPC commands

| Command | Signature | Description |
|---------|-----------|-------------|
| `window_get_state` | `(label: String) -> Option<WindowEntry>` | Frontend calls on mount to retrieve its saved workspaces. |
| `window_save_workspace_state` | `(label: String, workspaces: Vec<Workspace>, active_index: usize) -> ()` | Replaces the current `tauri-plugin-store` workspace save. |

### Removed

- `tauri-plugin-window-state` removed from `Cargo.toml` and `lib.rs`.
- `tauri-plugin-store` usage for `workspace-state.json` removed from `workspaceState.ts`.

---

## Startup and shutdown flow

### Startup

The `app.windows` entry in `tauri.conf.json` is removed (it was the source of the `"main"` label).
All window creation moves into `setup()`:

```rust
.setup(|app| {
    let manager = app.state::<WindowStateManager>();
    let state = manager.load();
    if state.window_order.is_empty() {
        create_app_window(app.handle(), generate_window_id(), None)?;
    } else {
        for id in &state.window_order {
            let entry = &state.windows[id];
            create_app_window(app.handle(), id.clone(), Some(entry))?;
        }
    }
    Ok(())
})
```

`create_app_window(handle, id, entry)` is extracted from the current `open_main_window()`. It
accepts the UUID as the Tauri window label and an optional `WindowEntry` to apply saved geometry.

### Window close

On `WindowEvent::Destroyed` for a main window (`w-` prefix):

1. `update_geometry()` with final size/position.
2. `remove_window(label)` -- window will not reopen next session.
3. `save()` -- persist immediately.
4. Count remaining `w-` windows; if zero, close settings if open.

### New window (`window.new` shortcut)

`open_main_window()` generates a new UUID, calls `add_window()`, creates the window with default
geometry (1280x800).

### App quit (Cmd+Q)

State is already persisted because each individual window close triggers step 3 above. No extra
logic needed.

---

## Frontend changes

### `workspaceState.ts` -- rewrite

The `LazyStore` is removed. Two IPC calls replace it:

```ts
// Called async on App mount, before rendering workspaces
export async function initWorkspaceState(): Promise<SavedState | null> {
  const label = getCurrentWebviewWindow().label;
  return invoke<WindowEntry | null>("window_get_state", { label });
}

// Debounced 800ms, same as now
export function saveWorkspaceState(workspaces: Workspace[], activeIndex: number): void {
  // ...debounce...
  const label = getCurrentWebviewWindow().label;
  void invoke("window_save_workspace_state", { label, workspaces, activeIndex });
}
```

### `App.tsx`

`getSavedWorkspaceState()` was synchronous (read from a cache populated before first render). The
new `initWorkspaceState()` is async. `App.tsx` starts with `null` workspace state and waits for
the `invoke` response before mounting workspaces -- the existing `init` `useEffect` pattern
already handles this.

### Unchanged

- `useWorkspaces`, `splitNode.ts`, and the entire Workspace/Pane/Panel model -- untouched.
- 800ms debounce on workspace saves -- kept.
- `tauri-plugin-store` remains for settings, themes, snippets, and other stores.

---

## Settings lifecycle

The current macOS `setup()` listener that watches `"main"` for close events is removed.

Instead, every `create_app_window()` call registers a `WindowEvent::Destroyed` listener. When any
main window closes, it counts remaining `w-` windows. When the count reaches zero, settings is
closed:

```rust
window.on_window_event(move |event| {
    if matches!(event, WindowEvent::Destroyed) {
        let remaining = app_handle
            .webview_windows()
            .keys()
            .filter(|l| l.starts_with("w-"))
            .count();
        if remaining == 0 {
            if let Some(s) = app_handle.get_webview_window("settings") {
                let _ = s.close();
            }
        }
    }
});
```

On Linux/Windows, `parent()` already handles child lifecycle. The settings window opens from
whichever main window is active, using that window's handle as parent.

---

## Migration

None. If `terax-windows.json` does not exist, Terax opens a single blank window. Old files
(`.window-state.json`, `workspace-state.json`) are left on disk as inert leftovers.
