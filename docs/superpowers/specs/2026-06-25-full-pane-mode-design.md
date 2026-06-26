# Full Pane Mode (replaces Zen Mode)

## Summary

Replace the existing minimal Zen Mode (which only hid the header) with a Full Pane Mode that hides the header AND expands the active pane to fill the entire workspace area. All other panes stay mounted in the DOM so PTYs, editor state, and WebGL contexts remain alive.

## Behavior

- **F5** toggles Full Pane Mode on/off
- When activated: header is hidden, active pane fills 100% of the workspace area
- When deactivated: header reappears, original split layout restores exactly
- Switching workspace automatically exits Full Pane Mode
- All non-visible panes remain mounted (terminals keep running, editors keep state)
- State is per-window, not persisted across sessions (like the original Zen Mode)

## Shortcut

- ID: `view.zenMode` (existing ID, no rename needed)
- Label: `"Toggle Full Pane"` (replaces `"Toggle Zen Mode"`)
- Default binding: `F5` (replaces `Cmd+Shift+Z`)

## State

Replace the existing `const [zenMode, setZenMode] = useState(false)` in `App.tsx` with:

```ts
const [zenPaneId, setZenPaneId] = useState<string | null>(null);
```

- `null` = normal mode
- `string` = Full Pane Mode active, value is the expanded pane's ID

## Handler

```ts
"view.zenMode": () => {
  setZenPaneId(prev =>
    prev !== null ? null : (activeWorkspace?.activePaneId ?? null)
  );
}
```

On workspace switch (`setActiveWorkspaceId` call sites): `setZenPaneId(null)`.

## Rendering

### Header

Hidden when `zenPaneId !== null` (same condition as before with `zenMode`).

### WorkspaceView

Receives a new prop `expandedPaneId?: string | null` and passes it through to `SplitNodeView`.

### SplitNodeView

Receives `expandedPaneId?: string | null`. For leaf `pane` nodes:

- If `pane.id === expandedPaneId`: render PaneView in a wrapper with `absolute inset-0 z-10` — breaks out of the ResizablePanelGroup flex layout to fill the WorkspaceView container (which has `relative`)
- If `expandedPaneId` is set and `pane.id !== expandedPaneId`: render PaneView in a wrapper with `invisible pointer-events-none` — hidden but mounted

When `expandedPaneId` is null: wrappers are transparent (no extra classes), same as today.

Split nodes (ResizablePanelGroup): render unchanged. The overlay pane escapes the flex layout via absolute positioning; the hidden panes are invisible but their DOM exists.

## Files changed

| File | Change |
|------|--------|
| `src/modules/shortcuts/shortcuts.ts` | Update `view.zenMode` label and default binding to F5 |
| `src/app/App.tsx` | Replace `zenMode: boolean` with `zenPaneId: string\|null`; update handler; reset on workspace switch; update render condition |
| `src/modules/workspaces/WorkspaceView.tsx` | Add `expandedPaneId` prop, pass to SplitNodeView |
| `src/modules/workspaces/SplitNodeView.tsx` | Add `expandedPaneId` prop, add wrapper div with conditional CSS on leaf pane nodes |

## Non-goals

- No persistence across sessions
- No per-workspace memory of expanded state
- No animation (keep it instant like the existing Zen Mode toggle)
- No change to the sidebar (right panel) visibility — it stays as-is
