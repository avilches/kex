# Status Color Design

**Feature:** Add colors to workspace statuses (like GitHub labels)
**Branch:** `state-color`
**Date:** 2026-07-01

---

## Problem

`WorkspaceStatus` only carries `{ id, label }`. The status badge in the Header and the group headers
in the WorkspaceBar are neutral/muted with no visual differentiation between statuses. Adding color
makes statuses visually scannable at a glance, matching the UX pattern of GitHub labels.

---

## Data model

### Change `WorkspaceStatus`

```ts
// Before
export type WorkspaceStatus = { id: string; label: string };

// After
export type WorkspaceStatus = { id: string; label: string; color?: string };
```

`color` is optional so existing persisted JSON without the field parses without migration code.
When absent the color is derived deterministically from the status ID.

### `parseWorkspaceStatuses`

Add a check that `color`, if present, is a string:

```ts
(typeof (item as WorkspaceStatus).color === "string" ||
  (item as WorkspaceStatus).color === undefined)
```

### `DEFAULT_WORKSPACE_STATUSES`

Add semantic colors from `WORKSPACE_COLOR_PALETTE`:

```ts
{ id: "archived",         label: "Archived",         color: "#14b8a6" }, // teal
{ id: "work-in-progress", label: "Work in progress",  color: "#3b82f6" }, // blue
{ id: "on-hold",          label: "On hold",           color: "#f97316" }, // orange
{ id: "canceled",         label: "Canceled",          color: "#ef4444" }, // red
{ id: "completed",        label: "Completed",         color: "#22c55e" }, // green
```

---

## Color resolution

New helper in `src/modules/workspaces/lib/workspaceColor.ts`:

```ts
// Always returns a string (statuses always have a color, unlike workspaces which can be null).
export function resolveStatusColor(color: string | undefined, id: string): string {
  return color ?? initialColorForId(id);
}

// Picks a random color from the palette (used when creating a new status).
export function randomStatusColor(): string {
  return WORKSPACE_COLOR_PALETTE[
    Math.floor(Math.random() * WORKSPACE_COLOR_PALETTE.length)
  ]!;
}
```

`initialColorForId` is the same stable hash already used for workspace colors, so a status without
an explicit color still gets a consistent color across sessions.

---

## Settings UI (`WorkspacesSection.tsx`)

### Color swatch in `SortableStatusRow`

Between the drag handle and the index number, add a small swatch button:

```
[drag] [swatch] [#1] [____label____________________] [x]
```

- Swatch: `size-[22px] rounded-full` circle showing `resolveStatusColor(status.color, status.id)`
- Clicking opens a Popover (shadcn) anchored to the swatch
- Popover content: grid of `WORKSPACE_COLOR_PALETTE` (11 circles, 3-4 per row)
- Each palette chip: `size-6 rounded-full` with a `border-2 border-foreground` ring when selected
- No "no color" option (statuses always have a color)
- No hex input (keep compact; the palette covers the use case)

### `handleAdd()`

```ts
const next: WorkspaceStatus = {
  id: newStatusId(),
  label: "",
  color: randomStatusColor(),
};
```

### `handleUpdate()`

Add a `handleUpdateColor(id, color)` function that calls `persist(statuses.map(s => s.id === id ? { ...s, color } : s))`.

---

## WorkspaceBar group headers

In the expanded non-compact group header button (the `<button>` that wraps the chevron + label):

Add a `4px wide x 12px tall` rounded bar before the label text, colored with the status color:

```tsx
const statusColor = workspaceStatuses.find(s => s.id === group.id);
const resolvedColor = statusColor
  ? resolveStatusColor(statusColor.color, statusColor.id)
  : undefined;

// In the button JSX:
{resolvedColor && (
  <span
    className="mr-0.5 h-3 w-1 shrink-0 rounded-full"
    style={{ backgroundColor: resolvedColor }}
  />
)}
```

In compact mode (`barWidth <= 80`), the group headers render as a horizontal rule; no indicator
needed there (compact mode shows no text labels).

---

## Header badge (`WorkspaceTitle.tsx`)

Change the status badge from a neutral bordered chip to a GitHub-style colored label:

```tsx
// Before
<span className="shrink-0 rounded border border-border/70 px-1 py-0.5 text-[9.5px]
                 font-medium uppercase tracking-wide leading-none text-muted-foreground">
  {status.label}
</span>

// After
const statusColor = resolveStatusColor(status.color, status.id);
<span
  className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase
             tracking-wide leading-none"
  style={{ backgroundColor: statusColor, color: "white" }}
>
  {status.label}
</span>
```

White text works across all 11 palette colors (all are saturated/dark enough for WCAG AA contrast
at 9.5px bold text in uppercase).

`WorkspaceTitle` already imports `resolveWorkspaceColor`; add `resolveStatusColor` to the import.

---

## Context menu in WorkspaceBar

The `ContextMenuRadioItem` for each status already shows just the label. Add a small colored circle
before the label inside each radio item for quick visual matching:

```tsx
<ContextMenuRadioItem key={s.id} value={s.id}>
  <span
    className="size-2 shrink-0 rounded-full"
    style={{ backgroundColor: resolveStatusColor(s.color, s.id) }}
  />
  {s.label}
</ContextMenuRadioItem>
```

---

## Tests

Update `parseWorkspaceStatuses` tests in `store.test.ts`:
- Add a case: `{ id: "a", label: "A", color: "#3b82f6" }` is preserved as-is.
- Add a case: `{ id: "a", label: "A", color: 123 }` is filtered out (invalid color type).
- Update `DEFAULT_WORKSPACE_STATUSES` snapshot test to include colors.

---

## Files changed

| File | Change |
|------|--------|
| `src/modules/settings/store.ts` | Add `color?` to `WorkspaceStatus`, update defaults + parser |
| `src/modules/settings/store.test.ts` | Update tests for new color field |
| `src/modules/workspaces/lib/workspaceColor.ts` | Add `resolveStatusColor` + `randomStatusColor` |
| `src/settings/sections/WorkspacesSection.tsx` | Swatch + popover in each row, color on add |
| `src/app/components/WorkspaceBar.tsx` | Colored indicator in group headers + context menu chips |
| `src/modules/header/WorkspaceTitle.tsx` | GitHub-label style colored badge |

No changes to `workspaceOrder.ts`, `types.ts`, `App.tsx`, or Rust code.

---

## What is NOT in scope

- Color contrast auto-selection (black vs white text) - white always works on the palette.
- Per-workspace status badge in the WorkspaceBar item itself (the workspace already has its own color).
- Custom hex input in the status color picker (palette is sufficient for labels).
- Persisted "collapsed" state per color - that already exists at group level.
