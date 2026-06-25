# Terminal: "Open new terminals in" setting

**Date:** 2026-06-25
**Status:** Approved

## Summary

Add a preference that controls the working directory used when a new terminal tab or split is opened. Two options:

- **Current folder** (default): uses the cwd of the active terminal, or the parent directory of the file open in the active editor. Falls back to the workspace folder when neither is available.
- **Workspace folder**: always uses the workspace root cwd, ignoring whatever panel is active.

## Motivation

Currently new terminals always inherit the cwd of the active terminal (via `activeCwdRef`), but silently fall back to the workspace root when the active panel is an editor. Users who want consistent behavior (always open at project root regardless of context) have no way to express that. Users who have an editor open also do not get the "inherit from context" benefit. This setting makes both behaviors explicit and configurable.

## Preference

**Type added to `store.ts`:**

```ts
export type TerminalNewFolderMode = "workspace" | "context";
```

**Field added to `Preferences`:**

```ts
terminalNewFolderMode: TerminalNewFolderMode;
```

**Default:** `"context"` -- preserves the current terminal-active behavior and extends it to editors.

**Storage key:** `"terminalNewFolderMode"`

**Setter:** `setTerminalNewFolderMode(v: TerminalNewFolderMode): Promise<void>`

The preference is persisted in `settings-general.json` via the existing `LazyStore` + `writePref` + Tauri event pattern.

## Context cwd derivation (`App.tsx`)

A new `contextCwdRef` is computed on every render alongside the existing `activeCwd`:

```
activePanel kind   | contextCwd value
-------------------|------------------------------------------
terminal           | panel.cwd ?? null
editor             | dirname(panel.path) or null if root
markdown           | dirname(panel.path) or null if root
git-diff           | dirname(panel.path) or null if root
browser / other    | null
no active panel    | null
```

`dirname` is computed as: `path.split(/[\\/]/).slice(0, -1).join("/") || null`

`contextCwdRef.current` is updated synchronously each render (same pattern as `activeCwdRef`).

`activeCwdRef` and `activeCwd` are NOT changed -- they continue to serve window title and status bar (terminal-only).

## Terminal creation logic

All places that open a new terminal read `usePreferencesStore.getState().terminalNewFolderMode` at call time and compute:

```ts
const targetCwd =
  terminalNewFolderMode === "workspace"
    ? ws.cwd
    : (contextCwdRef.current ?? ws.cwd);
```

Affected functions in `App.tsx`:
- `openNewTerminal` (new tab, drag-and-drop new pane)
- `onSplitTerminalRightStable` (split right)
- `onSplitTerminalDownStable` (split down)
- `openNewBlock` (agent blocks terminal)

When `ws.cwd` is `undefined` (workspace has no root folder), both modes behave identically -- the shell starts in its default home directory.

## UI (`TerminalSection.tsx`)

A `SettingRow` is inserted after "Default shell" and before the Font section:

```
title: "Open new terminals in"
description: "Where new terminal tabs and splits open."
control: Select (w-52, text-[12px])
```

Select items:
- value `"context"`, label `"Current folder"`, with secondary text below in `text-[10px] text-muted-foreground`: `"based on the terminal cwd or the path in the editor"`
- value `"workspace"`, label `"Workspace folder"`

The secondary text uses `className="block text-[10px] text-muted-foreground leading-tight"` inside the `SelectItem` content, following the pattern used in cursor-style items.

## Files changed

| File | Change |
|------|--------|
| `src/modules/settings/store.ts` | Add `TerminalNewFolderMode` type, field in `Preferences`, `DEFAULT_PREFERENCES` entry, KEY constant, setter |
| `src/app/App.tsx` | Add `contextCwdRef`; update `openNewTerminal`, `onSplitTerminalRightStable`, `onSplitTerminalDownStable`, `openNewBlock` |
| `src/settings/sections/TerminalSection.tsx` | Add `SettingRow` with `Select` after "Default shell" |

No Rust changes. No new dependencies.

## Edge cases

- Workspace with no `cwd`: both modes produce `undefined`; shell starts in home. Correct.
- Editor panel with a root-level path (e.g. `/foo.txt`): `dirname` returns `""`, which is coerced to `null`, falling back to `ws.cwd`. Correct.
- Active panel is browser, git-history, or commit-file: `contextCwd` is `null`, falls back to `ws.cwd`. Same behavior as today.
- No active panel at all: `contextCwd` is `null`, falls back to `ws.cwd`. Same behavior as today.
