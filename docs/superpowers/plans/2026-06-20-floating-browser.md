# Floating Browser Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow browser panels to "float out" into a native `WebviewUrl::External` Tauri window (real WKWebView, no iframe), with dock-back via close button or macOS app menu.

**Architecture:** A `floating?: boolean` flag on the browser panel keeps the panel in its pane (shown as placeholder). A Rust module `float_browser` manages floating windows indexed by `panelId`, wires navigation sync events and CloseRequested dock-back. React listens for Tauri events to update state and restore floating windows on startup.

**Tech Stack:** Tauri 2 (Rust), React 19, TypeScript, `@tauri-apps/api/core` (invoke), `@tauri-apps/api/event` (listen), hugeicons

## Global Constraints

- No em-dash, no emojis in any text (code, comments, UI strings).
- Commit messages in English, atomic, no co-author lines.
- All frontend imports use `@/...` aliases, never relative across modules.
- pnpm only. Run quality checks before each commit: `pnpm lint && pnpm check-types && pnpm test` and `cd src-tauri && cargo clippy && cargo test --locked`.
- Worktree: `.claude/worktrees/floating-browser` on branch `floating-browser`.
- Run all commands from the worktree root: `/Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/floating-browser`.

---

### Task 1: Rust - FloatBrowserState module + basic commands

**Files:**
- Create: `src-tauri/src/modules/float_browser.rs`
- Modify: `src-tauri/src/lib.rs` (add module, manage state, register 4 commands)

**Interfaces:**
- Produces:
  - `float_browser_open(panelId: String, url: String, originWindowLabel: String, workspaceId: String) -> Result<(), String>`
  - `float_browser_close(panelId: String) -> Result<(), String>`
  - `float_browser_focus(panelId: String) -> Result<(), String>`
  - `float_browser_dock(panelId: String) -> Result<(), String>` (dock + destroy)
  - Tauri events emitted to origin window:
    - `kex:float-dock { panelId: String, currentUrl: String }` — on dock
    - `kex:float-navigated { panelId: String, url: String }` — on page load

- [ ] **Step 1: Create `src-tauri/src/modules/float_browser.rs`**

```rust
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use serde_json::json;

#[derive(Debug)]
pub struct FloatMeta {
    pub origin_window_label: String,
    pub workspace_id: String,
}

pub struct FloatBrowserState {
    // panel_id -> meta
    pub panels: Mutex<HashMap<String, FloatMeta>>,
    // panel_id of the float window that last had OS focus (for menu "Dock to Kex")
    pub last_focused_panel_id: Mutex<Option<String>>,
}

impl FloatBrowserState {
    pub fn new() -> Self {
        Self {
            panels: Mutex::new(HashMap::new()),
            last_focused_panel_id: Mutex::new(None),
        }
    }
}

pub fn window_label(panel_id: &str) -> String {
    format!("float-{}", panel_id)
}

pub fn panel_id_from_label(label: &str) -> Option<String> {
    label.strip_prefix("float-").map(|s| s.to_string())
}

#[tauri::command]
pub fn float_browser_open(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    panel_id: String,
    url: String,
    origin_window_label: String,
    workspace_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);

    // If already open, focus it and return
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    {
        let mut map = state.panels.lock().unwrap();
        map.insert(
            panel_id.clone(),
            FloatMeta {
                origin_window_label: origin_window_label.clone(),
                workspace_id,
            },
        );
    }

    let panel_id_nav = panel_id.clone();
    let origin_nav = origin_window_label.clone();
    let app_nav = app.clone();

    let panel_id_close = panel_id.clone();
    let origin_close = origin_window_label.clone();
    let app_close = app.clone();
    let label_close = label.clone();

    let panel_id_focus = panel_id.clone();
    let app_focus = app.clone();

    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External(parsed_url),
    )
    .title("Kex Browser")
    .inner_size(1200.0, 800.0)
    .min_inner_size(640.0, 480.0)
    .resizable(true)
    .on_page_load(move |_webview, payload| {
        use tauri::webview::PageLoadEvent;
        if matches!(payload.event(), PageLoadEvent::Finished) {
            if let Some(origin_win) = app_nav.get_webview_window(&origin_nav) {
                let _ = origin_win.emit(
                    "kex:float-navigated",
                    json!({
                        "panelId": panel_id_nav,
                        "url": payload.url().to_string(),
                    }),
                );
            }
        }
    })
    .build()
    .map_err(|e| e.to_string())?;

    // Track last focused float window for the "Dock to Kex" menu item
    window.on_window_event({
        let app_f = app_focus.clone();
        let pid = panel_id_focus.clone();
        move |event| {
            if let WindowEvent::Focused(true) = event {
                let st = app_f.state::<FloatBrowserState>();
                *st.last_focused_panel_id.lock().unwrap() = Some(pid.clone());
            }
        }
    });

    // Dock back on window close (X button)
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            do_dock_and_destroy(&app_close, &panel_id_close, &origin_close, &label_close);
        }
    });

    Ok(())
}

/// Shared logic: get current URL, emit kex:float-dock to origin, remove from state, destroy window.
pub fn do_dock_and_destroy(
    app: &AppHandle,
    panel_id: &str,
    origin_label: &str,
    win_label: &str,
) {
    let current_url = app
        .get_webview_window(win_label)
        .and_then(|w| w.url().ok())
        .map(|u| u.to_string())
        .unwrap_or_default();

    if let Some(origin_win) = app.get_webview_window(origin_label) {
        let _ = origin_win.emit(
            "kex:float-dock",
            json!({ "panelId": panel_id, "currentUrl": current_url }),
        );
    }

    {
        let st = app.state::<FloatBrowserState>();
        let mut map = st.panels.lock().unwrap();
        map.remove(panel_id);
        let mut focused = st.last_focused_panel_id.lock().unwrap();
        if focused.as_deref() == Some(panel_id) {
            *focused = None;
        }
    }

    if let Some(win) = app.get_webview_window(win_label) {
        let _ = win.destroy();
    }
}

#[tauri::command]
pub fn float_browser_close(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    panel_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);
    {
        let mut map = state.panels.lock().unwrap();
        map.remove(&panel_id);
        let mut focused = state.last_focused_panel_id.lock().unwrap();
        if focused.as_deref() == Some(&panel_id) {
            *focused = None;
        }
    }
    if let Some(window) = app.get_webview_window(&label) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_focus(
    app: AppHandle,
    panel_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_dock(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    panel_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);
    let origin_label = {
        let map = state.panels.lock().unwrap();
        map.get(&panel_id).map(|m| m.origin_window_label.clone())
    }
    .ok_or_else(|| format!("no float window for panel {}", panel_id))?;

    do_dock_and_destroy(&app, &panel_id, &origin_label, &label);
    Ok(())
}
```

- [ ] **Step 2: Register module and state in `src-tauri/src/lib.rs`**

At the top, after existing module declarations (e.g. after `mod window_state;`):
```rust
mod float_browser;
```

Inside `tauri::Builder::default()` `.manage()` calls (after `app.manage(mgr)` for WindowStateManager):
```rust
app.manage(float_browser::FloatBrowserState::new());
```

Inside `.invoke_handler(tauri::generate_handler![...])`, add after existing commands:
```rust
float_browser::float_browser_open,
float_browser::float_browser_close,
float_browser::float_browser_focus,
float_browser::float_browser_dock,
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo clippy 2>&1 | grep -E "error|warning: unused"
```

Expected: no errors. Unused variable warnings for fields are fine at this stage.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/modules/float_browser.rs src-tauri/src/lib.rs
git commit -m "feat(float-browser): add Rust FloatBrowserState and open/close/focus/dock commands"
```

---

### Task 2: Rust - "Dock to Kex" menu item in Window submenu

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `float_browser::FloatBrowserState`, `float_browser::do_dock_and_destroy`
- Menu event id: `"dock_to_kex"`

- [ ] **Step 1: Add "Dock to Kex" item to the Window submenu**

In `lib.rs`, find the `// Window` submenu block (around line 481):
```rust
// Window
let dock_to_kex = MenuItemBuilder::with_id("dock_to_kex", "Dock to Kex")
    .build(app)?;
let window_menu = SubmenuBuilder::new(app, "Window")
    .minimize()
    .separator()
    .item(&dock_to_kex)
    .separator()
    .close_window()
    .build()?;
```

- [ ] **Step 2: Handle "dock_to_kex" in `on_menu_event`**

In `lib.rs`, inside `app.on_menu_event(|app, event| { ... })`, add before the final `emit_to` route (after the `"quit"` check):

```rust
if id == "dock_to_kex" {
    let st = app.state::<float_browser::FloatBrowserState>();
    let panel_id = st.last_focused_panel_id.lock().unwrap().clone();
    if let Some(pid) = panel_id {
        let label = float_browser::window_label(&pid);
        let origin = {
            let map = st.panels.lock().unwrap();
            map.get(&pid).map(|m| m.origin_window_label.clone())
        };
        if let Some(origin_label) = origin {
            float_browser::do_dock_and_destroy(app, &pid, &origin_label, &label);
        }
    }
    return;
}
```

- [ ] **Step 3: Verify**

```bash
cd src-tauri && cargo clippy 2>&1 | grep "error"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(float-browser): add Dock to Kex menu item in Window submenu"
```

---

### Task 3: TypeScript data model + useFloatBrowser hook

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts`
- Create: `src/modules/browser/useFloatBrowser.ts`

**Interfaces:**
- Produces (from `useFloatBrowser`):
  - `floatPanel(panel: Panel & { kind: "browser" }, workspaceId: string): Promise<void>`
  - `dockPanel(panelId: string, currentUrl: string): void`
  - `closeFloatWindow(panelId: string): Promise<void>`
  - `focusFloatWindow(panelId: string): Promise<void>`
  - `restoreFloatingPanels(workspaces: Workspace[]): Promise<void>`
  - `destroyWorkspaceFloats(workspaceId: string, workspaces: Workspace[]): Promise<void>`
- Consumes:
  - `closePanel(workspaceId, panelId)` and `updatePanelData(workspaceId, panelId, updater)` from `UseWorkspacesReturn`
  - Tauri events `kex:float-dock` and `kex:float-navigated`

- [ ] **Step 1: Add `floating` field to browser panel in `types.ts`**

```typescript
// In src/modules/workspaces/lib/types.ts
// Change the browser panel line from:
| { id: string; kind: "browser";         url: string;   title?: string }
// To:
| { id: string; kind: "browser";         url: string;   title?: string; floating?: boolean }
```

- [ ] **Step 2: Create `src/modules/browser/useFloatBrowser.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect } from "react";
import type { Panel, Workspace } from "@/modules/workspaces/lib/types";
import { allPanes } from "@/modules/workspaces/lib/splitNode";

type DockEvent = { panelId: string; currentUrl: string };
type NavigatedEvent = { panelId: string; url: string };

type Deps = {
  updatePanelData: (wsId: string, panelId: string, updater: (p: Panel) => Panel) => void;
  closePanel: (wsId: string, panelId: string) => void;
  findPanelGlobal: (panelId: string) => { workspace: { id: string }; panel: Panel } | null;
  workspaces: Workspace[];
};

export function useFloatBrowser({
  updatePanelData,
  closePanel,
  findPanelGlobal,
  workspaces,
}: Deps) {
  const originWindowLabel = getCurrentWebviewWindow().label;

  // Listen for dock-back events from floating windows
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DockEvent>("kex:float-dock", (e) => {
      const { panelId, currentUrl } = e.payload;
      const found = findPanelGlobal(panelId);
      if (!found) return;
      updatePanelData(found.workspace.id, panelId, (p) => ({
        ...p,
        floating: false,
        url: currentUrl || (p.kind === "browser" ? p.url : ""),
      }));
    })
      .then((u) => { unlisten = u; })
      .catch((err) => console.error("[float-browser] dock listen failed:", err));
    return () => { unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for URL navigation events from floating windows
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<NavigatedEvent>("kex:float-navigated", (e) => {
      const { panelId, url } = e.payload;
      const found = findPanelGlobal(panelId);
      if (!found) return;
      updatePanelData(found.workspace.id, panelId, (p) => ({
        ...p,
        url: url || (p.kind === "browser" ? p.url : ""),
      }));
    })
      .then((u) => { unlisten = u; })
      .catch((err) => console.error("[float-browser] navigated listen failed:", err));
    return () => { unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function floatPanel(
    panel: Panel & { kind: "browser" },
    workspaceId: string,
  ): Promise<void> {
    // Mark as floating in state first so the placeholder renders immediately
    updatePanelData(workspaceId, panel.id, (p) => ({ ...p, floating: true }));
    try {
      await invoke("float_browser_open", {
        panelId: panel.id,
        url: panel.url || "about:blank",
        originWindowLabel,
        workspaceId,
      });
    } catch (err) {
      // Rollback on failure
      updatePanelData(workspaceId, panel.id, (p) => ({ ...p, floating: false }));
      console.error("[float-browser] open failed:", err);
    }
  }

  function dockPanel(panelId: string, currentUrl: string): void {
    const found = findPanelGlobal(panelId);
    if (!found) return;
    updatePanelData(found.workspace.id, panelId, (p) => ({
      ...p,
      floating: false,
      url: currentUrl || (p.kind === "browser" ? p.url : ""),
    }));
  }

  async function closeFloatWindow(panelId: string): Promise<void> {
    try {
      await invoke("float_browser_close", { panelId });
    } catch (err) {
      console.error("[float-browser] close failed:", err);
    }
  }

  async function focusFloatWindow(panelId: string): Promise<void> {
    try {
      await invoke("float_browser_focus", { panelId });
    } catch (err) {
      console.error("[float-browser] focus failed:", err);
    }
  }

  async function dockViaCommand(panelId: string): Promise<void> {
    try {
      await invoke("float_browser_dock", { panelId });
    } catch (err) {
      console.error("[float-browser] dock failed:", err);
    }
  }

  // Called once on startup with the restored workspace list.
  // Re-opens floating windows for any panel with floating: true.
  async function restoreFloatingPanels(wss: Workspace[]): Promise<void> {
    for (const ws of wss) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          if (panel.kind === "browser" && panel.floating && panel.url) {
            await invoke("float_browser_open", {
              panelId: panel.id,
              url: panel.url,
              originWindowLabel,
              workspaceId: ws.id,
            }).catch((err) =>
              console.error("[float-browser] restore failed:", err),
            );
          }
        }
      }
    }
  }

  // Destroys all floating windows belonging to a closing workspace (no dock).
  async function destroyWorkspaceFloats(
    closingWorkspaceId: string,
    wss: Workspace[],
  ): Promise<void> {
    const ws = wss.find((w) => w.id === closingWorkspaceId);
    if (!ws) return;
    for (const pane of allPanes(ws.paneTree)) {
      for (const panel of pane.panels) {
        if (panel.kind === "browser" && panel.floating) {
          await invoke("float_browser_close", { panelId: panel.id }).catch(
            () => {},
          );
        }
      }
    }
  }

  return {
    floatPanel,
    dockPanel,
    dockViaCommand,
    closeFloatWindow,
    focusFloatWindow,
    restoreFloatingPanels,
    destroyWorkspaceFloats,
  };
}
```

- [ ] **Step 3: Run type check**

```bash
pnpm check-types 2>&1 | head -40
```

Expected: no errors related to the new files. The `floating` field may cause "object literal may only specify known properties" errors in test files — fix them by adding `floating?: boolean` acknowledgment or casting as needed.

- [ ] **Step 4: Commit**

```bash
git add src/modules/workspaces/lib/types.ts src/modules/browser/useFloatBrowser.ts
git commit -m "feat(float-browser): add floating field to browser panel type and useFloatBrowser hook"
```

---

### Task 4: App.tsx - wire float/dock + restore + workspace-close cleanup

**Files:**
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `useFloatBrowser` from `@/modules/browser/useFloatBrowser`
- Consumes: `updatePanelData`, `closePanel`, `findPanelGlobal`, `workspaces`, `closeWorkspace` from `useWorkspaces`

- [ ] **Step 1: Import and instantiate `useFloatBrowser` in `App.tsx`**

Add import at the top of `App.tsx`:
```typescript
import { useFloatBrowser } from "@/modules/browser/useFloatBrowser";
```

Inside the component body, after the `useWorkspaces` destructure, add:
```typescript
const {
  floatPanel,
  closeFloatWindow,
  focusFloatWindow,
  dockViaCommand,
  restoreFloatingPanels,
  destroyWorkspaceFloats,
} = useFloatBrowser({
  updatePanelData,
  closePanel,
  findPanelGlobal,
  workspaces,
});
```

- [ ] **Step 2: Restore floating panels on startup**

Find the `useEffect` that calls `initWorkspaceState` or where the initial workspaces are first available. After the initial state is loaded (look for `getSavedWorkspaceState` usage or where `initial?.initialWorkspaces` is consumed), add a one-shot restore effect:

```typescript
const restoredRef = useRef(false);
useEffect(() => {
  if (restoredRef.current) return;
  restoredRef.current = true;
  void restoreFloatingPanels(workspaces);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // run once on mount with initial workspaces
```

- [ ] **Step 3: Destroy floating windows when a workspace is closed**

Find where `closeWorkspace` is called (look for `onCloseWorkspace` or similar callbacks). Wrap it so floating windows are destroyed first:

```typescript
const handleCloseWorkspace = useCallback(
  async (wsId: string) => {
    await destroyWorkspaceFloats(wsId, workspacesRef.current);
    closeWorkspace(wsId);
  },
  [closeWorkspace, destroyWorkspaceFloats],
);
```

Replace the existing `closeWorkspace` callback prop with `handleCloseWorkspace` wherever it is passed to the workspace sidebar or workspace switcher.

- [ ] **Step 4: Intercept panel close for floating browser panels**

Find `onClosePanelStable` and `onCloseManyPanelsStable` (around line 527). Modify them to destroy floating windows before removing the panel from state:

```typescript
const onClosePanelStable = useCallback(
  (_wsId: string, panelId: string) => {
    const found = findPanelGlobal(panelId);
    if (found?.panel.kind === "browser" && found.panel.floating) {
      void closeFloatWindow(panelId);
    }
    closePanelsRef.current([panelId]);
  },
  [findPanelGlobal, closeFloatWindow],
);

const onCloseManyPanelsStable = useCallback(
  (_wsId: string, panelIds: string[]) => {
    for (const panelId of panelIds) {
      const found = findPanelGlobal(panelId);
      if (found?.panel.kind === "browser" && found.panel.floating) {
        void closeFloatWindow(panelId);
      }
    }
    closePanelsRef.current(panelIds);
  },
  [findPanelGlobal, closeFloatWindow],
);
```

- [ ] **Step 5: Expose floatPanel, dockViaCommand, focusFloatWindow through the component tree**

These are needed by `BrowserPane`. The cleanest path is to pass them down via `PanelContent`. Find where `PanelContent` is rendered (inside `PaneView`) and trace the prop path from `App.tsx` to `BrowserPane`.

Looking at the existing code, `PanelContent` receives panel-specific callbacks. Add to the `PaneView` / `WorkspaceView` / `PanelContent` chain:

```typescript
// Props to add to PaneView (and therefore WorkspaceView -> App.tsx):
onFloatBrowserPanel?: (panelId: string) => void;
onDockBrowserPanel?: (panelId: string) => void;
onFocusFloatBrowserPanel?: (panelId: string) => void;
```

In `App.tsx`, create stable callbacks:
```typescript
const onFloatBrowserPanel = useCallback(
  (panelId: string) => {
    const found = findPanelGlobal(panelId);
    if (!found || found.panel.kind !== "browser") return;
    void floatPanel(found.panel, found.workspace.id);
  },
  [findPanelGlobal, floatPanel],
);

const onDockBrowserPanel = useCallback(
  (panelId: string) => {
    void dockViaCommand(panelId);
  },
  [dockViaCommand],
);

const onFocusFloatBrowserPanel = useCallback(
  (panelId: string) => {
    void focusFloatWindow(panelId);
  },
  [focusFloatWindow],
);
```

Pass these down through `WorkspaceView` -> `PaneView` -> `PanelContent` -> `BrowserPane`. Each intermediate component just forwards them (no logic).

- [ ] **Step 6: Run type check**

```bash
pnpm check-types 2>&1 | head -60
```

Fix any type errors from the new props chain.

- [ ] **Step 7: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(float-browser): wire float/dock lifecycle in App.tsx"
```

---

### Task 5: PanelContent / WorkspaceView / PaneView prop forwarding

**Files:**
- Modify: `src/modules/workspaces/PaneView.tsx`
- Modify: `src/modules/workspaces/WorkspaceView.tsx`
- Modify: `src/modules/workspaces/PanelContent.tsx`

**Interfaces:**
- Consumes: `onFloatBrowserPanel`, `onDockBrowserPanel`, `onFocusFloatBrowserPanel` from Task 4
- Produces: same props available inside `BrowserPane`

- [ ] **Step 1: Add props to PaneView**

In `src/modules/workspaces/PaneView.tsx`, find the `Props` type and add:
```typescript
onFloatBrowserPanel?: (panelId: string) => void;
onDockBrowserPanel?: (panelId: string) => void;
onFocusFloatBrowserPanel?: (panelId: string) => void;
```

Forward them to `PanelContent`:
```typescript
<PanelContent
  // ...existing props...
  onFloatBrowserPanel={onFloatBrowserPanel}
  onDockBrowserPanel={onDockBrowserPanel}
  onFocusFloatBrowserPanel={onFocusFloatBrowserPanel}
/>
```

- [ ] **Step 2: Add props to WorkspaceView**

In `src/modules/workspaces/WorkspaceView.tsx`, find the `Props` type and add the same three props. Forward them to `SplitNodeView` / `PaneView`.

- [ ] **Step 3: Add props to PanelContent and forward to BrowserPane**

In `src/modules/workspaces/PanelContent.tsx`:

Find the `Props` type, add:
```typescript
onFloatBrowserPanel?: (panelId: string) => void;
onDockBrowserPanel?: (panelId: string) => void;
onFocusFloatBrowserPanel?: (panelId: string) => void;
```

Find the `browser` case in the panel switch and pass the new props:
```typescript
case "browser":
  return (
    <BrowserPane
      key={panel.id}
      ref={/* existing ref */}
      url={panel.url}
      floating={panel.floating ?? false}
      visible={visible}
      onUrlChange={/* existing */}
      onFloat={() => onFloatBrowserPanel?.(panel.id)}
      onDock={() => onDockBrowserPanel?.(panel.id)}
      onFocusFloat={() => onFocusFloatBrowserPanel?.(panel.id)}
    />
  );
```

- [ ] **Step 4: Run type check**

```bash
pnpm check-types 2>&1 | head -60
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspaces/PaneView.tsx src/modules/workspaces/WorkspaceView.tsx src/modules/workspaces/PanelContent.tsx
git commit -m "feat(float-browser): thread float/dock callbacks through workspace component tree"
```

---

### Task 6: BrowserPane - "Float out" button + FloatingPlaceholder

**Files:**
- Modify: `src/modules/browser/BrowserPane.tsx`
- Modify: `src/modules/browser/BrowserAddressBar.tsx`

**Interfaces:**
- Consumes: `floating: boolean`, `onFloat: () => void`, `onDock: () => void`, `onFocusFloat: () => void` (new props)

- [ ] **Step 1: Update BrowserPane props and render**

In `src/modules/browser/BrowserPane.tsx`:

Add to `Props`:
```typescript
floating: boolean;
onFloat: () => void;
onDock: () => void;
onFocusFloat: () => void;
```

In the render, when `floating` is true, render `FloatingPlaceholder` instead of the full browser UI:
```typescript
if (floating) {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background"
      style={{
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <FloatingPlaceholder
        url={url}
        onDock={onDock}
        onFocusFloat={onFocusFloat}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the FloatingPlaceholder component**

At the bottom of `BrowserPane.tsx`, add:

```typescript
function FloatingPlaceholder({
  url,
  onDock,
  onFocusFloat,
}: {
  url: string;
  onDock: () => void;
  onFocusFloat: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground">
        <HugeiconsIcon icon={Globe02Icon} size={20} strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          Viewing in a separate window
        </p>
        {url && (
          <p className="max-w-xs truncate text-xs text-muted-foreground">
            {url}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDock}
          className="rounded-md border border-border/60 bg-card px-3 py-1 text-[11px] hover:bg-accent/50"
        >
          Dock here
        </button>
        <button
          type="button"
          onClick={onFocusFloat}
          className="rounded-md border border-border/60 bg-card px-3 py-1 text-[11px] hover:bg-accent/50"
        >
          Focus window
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add "Float out" button to BrowserAddressBar**

In `src/modules/browser/BrowserAddressBar.tsx`:

Add `ArrowExpand01Icon` to the hugeicons import (or use `LinkSquare01Icon` if `ArrowExpand01Icon` is unavailable — run `pnpm check-types` to verify):
```typescript
import {
  ArrowReloadHorizontalIcon,
  ArrowExpand01Icon,
  Globe02Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
```

Add `onFloat?: () => void` to the `Props` type.

Add the float button in the address bar, after the existing "open externally" button:
```typescript
{onFloat && url && (
  <button
    type="button"
    title="Open in floating window"
    onClick={onFloat}
    className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
  >
    <HugeiconsIcon icon={ArrowExpand01Icon} size={12} strokeWidth={1.75} />
  </button>
)}
```

In `BrowserPane.tsx`, pass `onFloat` to `BrowserAddressBar`:
```typescript
<BrowserAddressBar
  ref={addressRef}
  url={url}
  onSubmit={onUrlChange}
  onReload={() => setNonce((n) => n + 1)}
  onFloat={onFloat}
/>
```

- [ ] **Step 4: Run checks**

```bash
pnpm check-types 2>&1 | head -40
pnpm lint 2>&1 | head -20
```

If `ArrowExpand01Icon` does not exist, the type check will report it. Substitute with `LinkSquare01Icon` or another icon from the same package that conveys "expand to window".

- [ ] **Step 5: Commit**

```bash
git add src/modules/browser/BrowserPane.tsx src/modules/browser/BrowserAddressBar.tsx
git commit -m "feat(float-browser): add float-out button and floating placeholder in BrowserPane"
```

---

### Task 7: PaneTabBar - floating tab appearance + panelClose bulk-closable

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`
- Modify: `src/modules/workspaces/lib/panelClose.ts`
- Modify: `src/modules/workspaces/lib/panelTitle.tsx`

**Interfaces:**
- Consumes: `panel.floating` from `Panel & { kind: "browser" }`

- [ ] **Step 1: Update panelTitle.tsx to show floating indicator**

In `src/modules/workspaces/lib/panelTitle.tsx`, find the icon map for `browser`. Add a visual indicator when the panel is floating. The simplest approach is to export a function `isBrowserFloating(panel: Panel): boolean` and use it in the tab.

```typescript
export function isBrowserFloating(panel: Panel): boolean {
  return panel.kind === "browser" && (panel.floating ?? false);
}
```

- [ ] **Step 2: Update the DraggableTab in PaneTabBar to show external icon**

In `src/modules/workspaces/PaneTabBar.tsx`:

Add import for a secondary icon to indicate floating state. Use `LinkSquare02Icon` (already available via the browser module):
```typescript
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
```

In `DraggableTab`, find where `panelIcon(panel, workspaceId)` is rendered. Wrap it:
```typescript
<span className={cn("shrink-0", hasAgent ? "opacity-100" : "opacity-70")}>
  {hasAgent ? (
    /* existing agent icon logic */
  ) : panel.kind === "browser" && panel.floating ? (
    <HugeiconsIcon icon={LinkSquare02Icon} size={12} strokeWidth={1.75} className="opacity-60" />
  ) : (
    panelIcon(panel, workspaceId)
  )}
</span>
```

- [ ] **Step 3: Make floating browser panels bulk-closable**

In `src/modules/workspaces/lib/panelClose.ts`:

The current `isBulkClosable` only locks terminals and editors. Floating browser panels are explicitly bulk-closable (per spec). The current implementation already handles this because `browser` panels are not `terminal` or `editor`. No change needed — verify:

```typescript
// Current implementation already returns true for browser panels:
export function isBulkClosable(panel: Panel): boolean {
  return !((panel.kind === "terminal" || panel.kind === "editor") && (panel.locked ?? false));
}
// browser panels (floating or not) always return true. No change needed.
```

- [ ] **Step 4: Run checks**

```bash
pnpm check-types 2>&1 | head -40
pnpm lint 2>&1 | head -20
pnpm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx src/modules/workspaces/lib/panelTitle.tsx src/modules/workspaces/lib/panelClose.ts
git commit -m "feat(float-browser): floating tab icon in PaneTabBar"
```

---

### Task 8: Final integration checks and commit

**Files:** None new — quality gates only.

- [ ] **Step 1: Full frontend check**

```bash
pnpm lint && pnpm check-types && pnpm test
```

Expected: all pass. Fix any remaining issues.

- [ ] **Step 2: Full Rust check**

```bash
cd src-tauri && cargo clippy -- -D warnings && cargo test --locked
```

Expected: no errors.

- [ ] **Step 3: Smoke-test checklist (manual)**

Start the app with `pnpm tauri dev` from the worktree root and verify:

- [ ] Browser panel shows "Float out" button when a URL is loaded
- [ ] Clicking "Float out" marks tab with external icon, placeholder shows in pane
- [ ] Floating window opens and loads the URL (Google, GitHub, etc.)
- [ ] Navigating in float window updates `panel.url` (check via dock-back URL)
- [ ] Closing floating window (X) docks panel back and activates it
- [ ] "Dock here" button in placeholder docks the panel back
- [ ] "Focus window" button brings floating window to front
- [ ] macOS: Window > Dock to Kex docks the focused float window
- [ ] Close tab (X in tab bar) on floating tab destroys window + removes panel
- [ ] Close All Tabs destroys floating windows
- [ ] Close Other Tabs destroys floating panels not matching the active tab
- [ ] Closing workspace destroys its floating windows (no dock)
- [ ] Restart app: floating panels reopen in their floating windows

- [ ] **Step 4: Final commit if any fixes were made**

```bash
git add -A
git commit -m "fix(float-browser): integration fixes from smoke test"
```
