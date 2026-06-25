# Editor path bar design

## Goal

Give the editor a thin top bar that shows the open file's path relative to the
workspace root, and relocate the controls that currently float over the editor
(language selector, view-options `...`, split toggle, preview toggle) into that
bar. The floating overlay disappears; the bar becomes the first row of the
editor panel layout.

## Context

Today `EditorOverlayBar` renders as a floating chip (`absolute right-3 top-3`,
`backdrop-blur`, `shadow`, `pointer-events` wrapper hacks) and is mounted in
`PanelContent.tsx` only when `showPreviewToggle` is true (Markdown/HTML files).
For a normal `.ts`/`.json` file no bar appears at all, so the language selector
and view options are unreachable there.

The bottom status bar (`CwdBreadcrumb`) already shows the active file path as a
navigable breadcrumb with an absolute path and `~` for home. The new top bar is
a separate, independent component: it shows a path relative to the workspace
root and is not navigable. The two do not depend on each other; the status bar
may be removed later without affecting the top bar.

## Scope decisions (validated with user)

- **Where it appears:** every editor file (`.ts`, `.json`, `.md`, `.html`, ...),
  not only Markdown/HTML. The bar is pulled out of the `showPreviewToggle`
  conditional.
- **Path format:** relative to the active workspace `explorerRoot`. When the
  file lives outside that root, fall back to an absolute path with `~` for home.
- **Split mode:** a single bar spanning the full width (editor + preview), with
  the controls on the far right.
- **Interactivity:** not navigable. Path segments are plain text. The only
  gesture is a click on the filename leaf to reveal the file in the explorer
  (`onFocusOnExplorer`), with a native tooltip showing the absolute path.

## Layout

The bar is the first row of the editor panel's flex column (it stops floating):

```
+-----------------------------------------------------------+
| src > modules > editor > EditorPane.tsx   [TS] [...] [split] [eye] |  thin bar (~26-28px)
+-----------------------------------------------------------+
|                                                           |
|                  CodeMirror / preview                     |
|                                                           |
+-----------------------------------------------------------+
```

- Left: relative path. Right: the existing controls, recolocated, with no change
  to their logic.
- Styling: height ~26-28px, `border-b border-border/60`, `bg-card/40`,
  `text-[11px]`. Remove the `backdrop-blur` / `shadow-sm` / `pointer-events-none`
  wrapper and `pointer-events-auto` on the bar, since it no longer floats over
  content.
- The editor/preview area sits below the bar and gets the remaining height
  (`flex-1 min-h-0`). The split divider and the overlay/split preview panes keep
  their current positioning but inside the area below the bar.

## Path rendering

A small pure helper computes the display segments:

- Input: `path` (absolute, forward-slash), `explorerRoot` (string | null),
  `home` (string | null).
- If `explorerRoot` is set and `path` is inside it (prefix match on normalized
  separators), segments are the relative remainder
  (`modules/editor/EditorPane.tsx` -> `["modules", "editor", "EditorPane.tsx"]`).
- Otherwise fall back to absolute segments via the existing `segmentsFromCwd`
  (so home collapses to `~`).
- Directory segments render in `text-muted-foreground`, separated by a chevron
  glyph; the filename leaf renders in `text-foreground`.
- Overflow: truncate from the left with a leading ellipsis, always keeping the
  filename leaf visible (CSS: a flex row with `min-w-0`, the directory part
  `truncate` with `direction: rtl` trick or a leading `.../` marker, the leaf
  not shrinking).

The helper is unit-testable in isolation (inside-root, outside-root, home,
Windows drive letter, root itself).

## Data flow

`explorerRoot` already exists in `App.tsx`. Thread it as one prop through the
existing render chain, riding the `{...rest}` already spread down:

```
App -> WorkspaceView -> SplitNodeView -> PaneView -> PanelContent
```

`PanelContent` passes `explorerRoot` and `home` to the bar for the `editor`
(and `markdown`) panel kinds. `home` is already available at the App level.

## Component shape

`EditorOverlayBar` is renamed/reshaped into a top bar (proposed name
`EditorPathBar`, keeping the existing control sub-blocks). Its props gain:

- `path: string` (the file path, for the relative path display)
- `explorerRoot: string | null`
- `home: string | null`
- `onReveal?: () => void` (filename click -> reveal in explorer)

The control props (`view`, `viewToggles`, `globalToggles`, `overrideLanguage`,
`currentLanguageName`, `onLanguageChange`) are unchanged. The bar always renders
when the panel is an editor; the language selector shows for every file, the
preview/split controls only when `view` is provided (md/html), exactly as today.

## Error handling / edge cases

- `explorerRoot` null (filesystem root mode, no workspace pin): fall back to the
  absolute `~`-collapsed form.
- File path equal to `explorerRoot` (cannot really happen for a file, but guard):
  show just the filename.
- Very long single segment with no separators: leaf still pinned visible, the
  segment truncates.
- Windows: normalize separators with `.split(/[\\/]/)`; drive-letter paths flow
  through `segmentsFromCwd` as today.

## Testing

- Unit tests for the path helper: inside root, outside root (absolute fallback),
  home collapse, root-is-prefix-but-not-boundary (`/foo/bar` vs `/foo/barbaz`
  must not match), Windows drive letter.
- The bar render is thin and declarative; no new test harness needed beyond the
  helper.

## Out of scope

- Navigable path segments / folder dropdowns (the status bar already does this).
- Removing or changing the bottom status bar.
- Tab-strip or breadcrumb changes elsewhere.
