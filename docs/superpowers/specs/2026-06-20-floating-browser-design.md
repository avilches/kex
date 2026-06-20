# Floating Browser Windows

**Date:** 2026-06-20
**Branch:** floating-browser

## Overview

Browser panels can be "floated out" into a separate native Tauri window that loads
the URL directly via `WebviewUrl::External`. This gives a real WKWebView without
iframe restrictions, so any public site (Google, GitHub, etc.) works. The panel
remains in its pane as a placeholder. The user can dock it back at any time.

## Data Model

Add `floating?: boolean` to the `browser` panel type in `src/modules/workspaces/lib/types.ts`:

```ts
| { id: string; kind: "browser"; url: string; title?: string; floating?: boolean }
```

A panel with `floating: true` stays in `pane.panels`. The pane may have all its
panels in floating state (it becomes a visible placeholder pane, not auto-closed).

**No separate `floatingPanels` array.** The panel ownership is in the pane, always.

## Floating Window

- **Tauri label:** `float-<panelId>`
- **URL:** `WebviewUrl::External(panel.url)` - real WKWebView, no iframe
- **Title bar:** native macOS title bar (non-overlay), title = page title or URL
- **Navigation sync:** Rust listens to navigation events on the webview and emits
  `kex:float-navigated { panelId, url }` to the origin main window so `panel.url`
  stays current.
- **Page title sync:** when the page title changes, emit `kex:float-title-changed
  { panelId, title }` to update `panel.title`.

### Rust State

```rust
struct FloatMeta {
    panel_id: String,
    origin_window_label: String,
    workspace_id: String,
}

// AppState: Mutex<HashMap<panelId, FloatMeta>>
struct FloatBrowserState(Mutex<HashMap<String, FloatMeta>>);
```

## IPC Commands

| Command | Args | Description |
|---|---|---|
| `float_browser_open` | `panelId, url, originWindowLabel, workspaceId` | Creates floating window, registers in state |
| `float_browser_close` | `panelId` | Destroys window, removes from state. Does NOT dock back. |
| `float_browser_focus` | `panelId` | Brings the floating window to front |

## Dock Back Mechanisms

Three triggers, one flow: get current URL from the webview, emit
`kex:float-dock { panelId, currentUrl }` to the origin window, destroy the floating
window. React updates state when it receives the event.

1. **Close (X) on the floating window:** Rust intercepts `CloseRequested` ->
   `api.prevent_close()` -> gets current URL via `window.url()` -> emits
   `kex:float-dock` to origin window -> destroys window via `window.destroy()`.

2. **"Dock here" button** in the pane placeholder: React calls
   `float_browser_dock(panelId)`. Rust gets current URL, emits `kex:float-dock` to
   origin window, destroys window. Returns `Ok(())`.

3. **App menu "Dock to Kex":** Rust menu handler identifies the focused `float-*`
   window, same flow as above.

**IPC command added:** `float_browser_dock(panelId)` - dock + destroy in one call.

## Tab Bar Appearance

The tab for a floating panel:
- Shows a "external window" icon instead of the globe icon
- The tab title shows the URL or page title as normal
- The close (X) button works normally: **closes the panel AND destroys the floating
  window** (no dock back, no confirmation). Consistent with normal tab X behavior.

## Pane Placeholder Content

When the active panel in a pane is floating, the content area shows:

```
[external window icon]
Viewing in a separate window

URL: https://google.com
Title: Google (if available from panel.title)

[ Dock here ]     [ Focus window ]
```

The "Focus window" button calls `float_browser_focus` to bring the window to front.

## Lifecycle Rules

### Float out
1. React: `panel.floating = true`, save state.
2. React: `invoke("float_browser_open", { panelId, url, originWindowLabel, workspaceId })`.

### Dock back (any mechanism)
1. React receives `kex:float-dock { panelId, currentUrl }`.
2. React: find panel by id across all workspaces, set `floating = false`, update `url`
   to `currentUrl`, set as active panel in its pane.
3. Rust: destroy the floating window.

### Close tab (X in tab bar) on a floating panel
1. React calls `float_browser_close(panelId)` (no dock, just destroy window).
2. React removes the panel from the pane normally.

### "Close all tabs" or "Close other tabs"
Floating panels are included without confirmation:
- For each floating panel in scope: call `float_browser_close(panelId)`.
- Remove from pane.panels.

### Workspace closed
React detects workspace removal. For each `floating: true` panel in the workspace:
call `float_browser_close(panelId)`. Do NOT dock back.

### App restore
`initWorkspaceState` finds panels with `floating: true`. For each:
call `float_browser_open(panelId, panel.url, ...)` to recreate the floating window.
The panel is already in the pane as `floating: true`, so the workspace renders the
placeholder immediately.

## App Menu

The `Window` menu gets a "Dock to Kex" item. It is enabled only when the focused
window label starts with `float-`. Selecting it calls the same dock flow as closing
the window.

Implementation: Tauri 2 menu API in Rust (`tauri::menu::MenuBuilder`). Listen for
`WindowEvent::Focused(true)` on all windows to update the enabled state of the menu
item.

## React Changes

### `types.ts`
Add `floating?: boolean` to browser panel.

### `useWorkspaces.ts`
- `floatBrowserPanel(workspaceId, panelId)`: sets `panel.floating = true`, calls
  `float_browser_open`.
- `dockBrowserPanel(panelId, currentUrl)`: sets `floating = false`, updates `url`,
  activates the panel.
- `closePanelAndFloatWindow(workspaceId, panelId)`: destroys window + removes panel.
  Called by "Close all", "Close other", X on floating tab, workspace close.

### `BrowserPane.tsx`
When `panel.floating === true`: render the placeholder (icon, URL, title, "Dock
here" button, "Focus window" button). No iframe mounted.

The "Float out" button appears in the browser address bar only when `!panel.floating`
and there is a URL. Icon: `ExternalLink` or similar.

### `PaneTabBar.tsx`
Floating panels: render the tab with an external-window icon instead of the globe.
The X button closes (calls `closePanelAndFloatWindow`), not docks.

### `App.tsx`
On mount: listen for `kex:float-dock` and `kex:float-navigated` and
`kex:float-title-changed` Tauri events. Route to `dockBrowserPanel` /
update `panel.url` / update `panel.title`.

## What We Do Not Build

- Address bar in the floating window (it is a raw WKWebView, native chrome only).
- Back/forward navigation buttons (native only via keyboard shortcuts).
- Google OAuth support (WKWebView may still be detected as embedded by some OAuth
  providers, per Atrium's findings - not in scope).
- Linux/Windows native title bar customization.
