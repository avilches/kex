# External Editors: Design Spec

Date: 2026-06-28

## Overview

Add a context-aware "Open in external editor" button to the Kex header bar. The button shows which path it will open (adapting to the focused panel), launches the preferred editor on click, and exposes a dropdown to pick any installed editor. Editors are detected natively per platform. Users can configure editors and a preferred default from Settings.

---

## Architecture

### Rust -- new module `src-tauri/src/modules/editors/`

| File | Responsibility |
|---|---|
| `mod.rs` | Two Tauri commands: `editor_scan`, `editor_open` |
| `catalog.rs` | Static list of known editors with per-platform detection config |
| `detect.rs` | Platform-specific detection: `mdfind` (macOS), `which` (Linux), `where` (Windows) |

Registered in `lib.rs` alongside existing modules.

### TypeScript -- new module `src/modules/external-editors/`

| File | Responsibility |
|---|---|
| `types.ts` | `DetectedEditor`, `CustomEditor` types |
| `useExternalEditors.ts` | Lazy detection hook + module-level cache |
| `OpenInEditorButton.tsx` | Header button: preferred editor + dropdown |
| `index.ts` | Barrel export |

### Settings

New section `src/settings/sections/ExternalEditorsSection.tsx`, registered in the Settings window router.

### Header integration

`App.tsx` computes `openInEditorTarget` (new prop) alongside the existing `searchTarget`, and passes it to `Header`. `Header` renders `<OpenInEditorButton>` just before `<SearchInline>`.

---

## Rust: Editor Catalog (`catalog.rs`)

Each entry is a static struct:

```rust
struct EditorEntry {
    id: &'static str,
    name: &'static str,
    bundle_id: Option<&'static str>,       // macOS bundle identifier for mdfind
    cli_binary: &'static str,              // binary name for PATH lookup
    args_before_path: &'static [&'static str],  // extra flags (JetBrains needs these)
}
```

### Supported editors

**General editors / terminals:**
- VS Code (`com.microsoft.VSCode`, `code`)
- VS Code Insiders (`com.microsoft.VSCodeInsiders`, `code-insiders`)
- VSCodium (`com.vscodium`, `codium`)
- Cursor (`com.todesktop.230313mzl4w4u92`, `cursor`)
- Windsurf (`com.exafunction.windsurf`, `windsurf`)
- Zed (`dev.zed.Zed`, `zed`)
- Zed Preview (`dev.zed.Zed-Preview`, `zed`)
- Kiro (`software.kiro.Kiro`, `kiro`)
- Trae (`com.bytedance.trae`, `trae`)
- Antigravity (`com.google.antigravity`, `antigravity`)
- Sublime Text (`com.sublimetext.4`, `subl`)
- Atom (`com.github.atom`, `atom`)
- BBEdit (`com.barebones.bbedit`, `bbedit`)
- CotEditor (`com.coteditor.CotEditor`, `cot`)
- TextMate (`com.macromates.TextMate`, `mate`)
- CodeRunner (`com.krill.CodeRunner`, none)

**JetBrains IDEs** (all use Toolbox CLI when available; macOS fallback via `open -na`):
- IntelliJ IDEA (`com.jetbrains.intellij`, `idea`)
- PyCharm (`com.jetbrains.pycharm`, `pycharm`)
- WebStorm (`com.jetbrains.WebStorm`, `webstorm`)
- GoLand (`com.jetbrains.goland`, `goland`)
- RubyMine (`com.jetbrains.rubymine`, `rubymine`)
- RustRover (`com.jetbrains.rustrover`, `rustrover`)
- Android Studio (`com.google.android.studio`, `studio`)
- Rider (`com.jetbrains.rider`, `rider`)
- AppCode (`com.jetbrains.AppCode`, `appcode`)
- CLion (`com.jetbrains.clion`, `clion`)
- PhpStorm (`com.jetbrains.PhpStorm`, `phpstorm`)
- MPS (`com.jetbrains.mps`, `mps`)

---

## Rust: Detection (`detect.rs`)

### `editor_scan` command

Takes no input. Iterates the catalog and detects each editor in parallel (`FuturesUnordered`). Returns `Vec<DetectedEditor>` containing only the editors that are found.

```rust
pub struct DetectedEditor {
    pub id: String,
    pub name: String,
    pub binary: String,            // resolved binary path
    pub args_before_path: Vec<String>,
}
```

### Per-platform strategy

**macOS:**
1. Run `mdfind 'kMDItemCFBundleIdentifier == "<bundle_id>"'`.
2. If output is non-empty, the app is installed. The first line is the `.app` path.
3. **Zed:** binary is `<app_path>/Contents/MacOS/cli` (not the `.app` itself).
4. **JetBrains:** check `~/Library/Application Support/JetBrains/Toolbox/scripts/<cli_binary>` first. If it exists, use that. Otherwise fall back to `open -na "<App Name>.app" --args` (binary = `open`, args include `-na`, `<App Name>.app`, `--args`).
5. **Editors without CLI** (BBEdit, CotEditor, TextMate, CodeRunner): binary = `open`, args = `["-b", "<bundle_id>"]`.
6. Fallback for entries with no bundle_id: `which <cli_binary>`.

**Linux:**
1. `which <cli_binary>` -- returns the resolved path.
2. **JetBrains:** check `~/.local/share/JetBrains/Toolbox/scripts/<cli_binary>` first.

**Windows:**
1. `where <cli_binary>` -- returns the resolved path.
2. **JetBrains:** check `%LOCALAPPDATA%\JetBrains\Toolbox\scripts\<cli_binary>.cmd` first.

---

## Rust: Launch (`mod.rs`)

### `editor_open` command

```rust
pub async fn editor_open(
    binary: String,
    args_before_path: Vec<String>,
    path: String,
) -> Result<(), String>
```

Executes `std::process::Command::new(&binary).args(&args_before_path).arg(&path).spawn()`. Fire-and-forget -- does not wait for the process. Does NOT go through the user's shell (`sh -c`) to avoid interfering with terminal environment.

Returns `Err(String)` if `spawn()` fails (binary not found, permission denied, etc.).

---

## TypeScript: Data Model (`types.ts`)

```typescript
// Returned by editor_scan
export interface DetectedEditor {
  id: string;
  name: string;
  binary: string;
  argsBeforePath: string[];
}

// User-defined in Settings
export interface CustomEditor {
  id: string;           // client-generated uuid
  name: string;
  binary: string;
  argsBeforePath: string[];
}

export type AnyEditor = DetectedEditor | CustomEditor;
```

### Preferences store additions

```typescript
preferredEditorId: string | null;   // default: null (first detected used implicitly)
customEditors: CustomEditor[];      // default: []
```

---

## TypeScript: Detection Hook (`useExternalEditors.ts`)

Module-level cache: `detectedEditors: DetectedEditor[] | null` and `scanPromise: Promise | null`.

The hook returns `{ editors, isScanning, scan }`:
- `editors`: `DetectedEditor[]` -- empty until first scan completes.
- `isScanning`: boolean.
- `scan()`: triggers `editor_scan` if not already running. Called lazily on first dropdown open and from the Settings "Scan" button.

No automatic scan on mount. No polling.

---

## TypeScript: Header Button (`OpenInEditorButton.tsx`)

### Context target (computed in `App.tsx`)

```typescript
// New prop on Header
openInEditorTarget: { path: string; kind: "file" | "dir" } | null
```

Computed logic:
- `panel.kind === "terminal"` -- `{ path: panel.cwd, kind: "dir" }`
- `panel.kind === "editor"` -- `{ path: panel.path, kind: "file" }`
- `panel.kind === "browser" | "markdown" | "git-*"` -- active workspace root directory (`activeWorkspace.rootPath`) as `{ path, kind: "dir" }`
- No active panel -- `null`

### Button anatomy

```
[ <editor-icon 16px> <path-label> <ChevronDown 10px> ]
```

- **editor-icon:** SVG from `src/assets/editors/<id>.svg` for the preferred editor. Fallback: `Code02Icon` from hugeicons for custom editors or when no preferred is set.
- **path-label:** directory target shows only the last path segment (same truncation as `TerminalPathBar`). File target shows filename only. `max-w-[120px] truncate text-[12px] text-muted-foreground`.
- **Left area click** (icon + label): launches the preferred editor immediately. If no preferred editor is set, opens the dropdown instead.
- **ChevronDown click**: always opens the dropdown.
- **Disabled state** (`target === null`): reduced opacity, no interaction.

### Dropdown

Lists all detected editors + custom editors. Each item: icon (16px) + name. Currently preferred editor shows a checkmark. Selecting an item:
1. Launches the editor immediately via `editor_open`.
2. Saves it as the new `preferredEditorId`.

**Empty state** (no editors detected yet, or scan returned nothing): shows "No editors detected" + a link that opens Settings at the External Editors section.

### Preferred editor fallback

If `preferredEditorId` refers to an editor no longer in the detected list (uninstalled since last scan), the button renders with the generic icon and clicking opens the dropdown.

---

## Settings: External Editors Section

Location: `src/settings/sections/ExternalEditorsSection.tsx`

```
External Editors
────────────────────────────────────────
Default editor
  [ Cursor ▾ ]

Detected editors          [ Scan for available editors ]
  Cursor          /usr/local/bin/cursor
  VS Code         /usr/local/bin/code
  Zed             /Applications/Zed.app/Contents/MacOS/cli

Custom editors
  Helix    /usr/local/bin/hx    [ x ]
  [ + Add editor ]
```

- **Default editor selector:** dropdown populated with all available editors (detected + custom). Saves to `preferredEditorId`.
- **Detected editors list:** read-only. Shows name and resolved binary path. Updated by "Scan" button.
- **Scan button:** calls `scan()` from `useExternalEditors`. Shows spinner while running.
- **Custom editors:** editable rows with name input + binary path input + delete button. "Add editor" appends a new empty row. No pre-validation of the binary path -- errors surface on launch.

---

## Icons

SVG assets in `src/assets/editors/<id>.svg`. Sourced from emdash, supacode, JetBrains/logos, and simple-icons.

Editors without a public SVG (BBEdit, CotEditor, TextMate, CodeRunner) use the `Code02Icon` hugeicons fallback.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Detection failure for one editor | Silently omitted from results; scan continues |
| `editor_open` spawn fails | Error toast with the OS error message |
| No editors detected | Dropdown shows "No editors detected" + link to Settings |
| Preferred editor uninstalled | Button uses generic icon; click opens dropdown |
| Custom editor with invalid binary | `editor_open` returns error, shown as toast |
