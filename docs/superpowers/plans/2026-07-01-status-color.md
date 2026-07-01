# Status Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-status colors to `WorkspaceStatus` so they display as colored labels (GitHub-style) in the WorkspaceBar group headers, the context menu, and the Header badge.

**Architecture:** Extend the `WorkspaceStatus` type with an optional `color?: string` field, add resolver helpers to `workspaceColor.ts`, wire random color assignment on creation in Settings, and update the three render sites (WorkspacesSection, WorkspaceBar, WorkspaceTitle).

**Tech Stack:** TypeScript, React 19, Tailwind v4, shadcn/ui (Popover), Vitest

**Working directory:** `/Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color`
All file paths below are relative to that root. All `git` commands must be run from that directory.

## Global Constraints

- No backward-compat code (no migrations, no fallback keys for old field names).
- All IDs via `nid()`-based helpers in `src/lib/ids.ts`; never `Math.random()` for IDs.
- `Math.random()` IS allowed for picking a random palette color (not an entity ID).
- No em-dash, no emojis, no "Co-authored-by" in commits.
- Commit messages in English, imperative mood.
- Run quality checks before each commit: `pnpm check-types` and `pnpm test`.
- Use `pnpm exec biome lint ./src` (NOT `pnpm lint`) to avoid RTK proxy issues.
- Path imports always `@/…`, never relative across modules.
- shadcn components from `@/components/ui/…`.

---

### Task 1: Extend WorkspaceStatus type, defaults, parser, and color helpers

**Files:**
- Modify: `src/modules/settings/store.ts` (lines 17-37 and around line 19-25)
- Modify: `src/modules/workspaces/lib/workspaceColor.ts`
- Modify: `src/modules/settings/store.test.ts`

**Interfaces:**
- Produces:
  - `WorkspaceStatus = { id: string; label: string; color?: string }` (exported from `store.ts`)
  - `DEFAULT_WORKSPACE_STATUSES` updated with `color` on each entry
  - `parseWorkspaceStatuses(value: unknown): WorkspaceStatus[]` updated to validate `color`
  - `resolveStatusColor(color: string | undefined, id: string): string` (exported from `workspaceColor.ts`)
  - `randomStatusColor(): string` (exported from `workspaceColor.ts`)

- [ ] **Step 1: Write failing tests for the updated model**

Open `src/modules/settings/store.test.ts`. After the last existing test in the `parseWorkspaceStatuses` describe block (currently line 188), add these test cases **inside** the existing `describe("parseWorkspaceStatuses", ...)` block:

```ts
  it("preserves a valid color string", () => {
    const input = [{ id: "a", label: "A", color: "#3b82f6" }];
    expect(parseWorkspaceStatuses(input)).toEqual(input);
  });

  it("filters out items with a non-string color", () => {
    const input = [{ id: "a", label: "A", color: 123 }];
    expect(parseWorkspaceStatuses(input)).toEqual([]);
  });

  it("accepts items where color is absent", () => {
    const input = [{ id: "a", label: "A" }];
    expect(parseWorkspaceStatuses(input)).toEqual([{ id: "a", label: "A" }]);
  });
```

Also update the `DEFAULT_WORKSPACE_STATUSES` test at the bottom (around line 190) to verify colors:

```ts
describe("DEFAULT_WORKSPACE_STATUSES", () => {
  it("contains the five predefined statuses in order with colors", () => {
    const ids = DEFAULT_WORKSPACE_STATUSES.map((s) => s.id);
    expect(ids).toEqual([
      "archived",
      "work-in-progress",
      "on-hold",
      "canceled",
      "completed",
    ]);
    for (const s of DEFAULT_WORKSPACE_STATUSES) {
      expect(s.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm test -- --reporter=verbose 2>&1 | grep -A3 "parseWorkspaceStatuses\|DEFAULT_WORKSPACE"
```

Expected: FAIL on the new color-related assertions.

- [ ] **Step 3: Update WorkspaceStatus type in store.ts**

In `src/modules/settings/store.ts`, change line 17:

```ts
// Before
export type WorkspaceStatus = { id: string; label: string };

// After
export type WorkspaceStatus = { id: string; label: string; color?: string };
```

- [ ] **Step 4: Update DEFAULT_WORKSPACE_STATUSES in store.ts**

Replace lines 19-25 in `src/modules/settings/store.ts`:

```ts
export const DEFAULT_WORKSPACE_STATUSES: WorkspaceStatus[] = [
  { id: "archived",         label: "Archived",        color: "#14b8a6" },
  { id: "work-in-progress", label: "Work in progress", color: "#3b82f6" },
  { id: "on-hold",          label: "On hold",          color: "#f97316" },
  { id: "canceled",         label: "Canceled",         color: "#ef4444" },
  { id: "completed",        label: "Completed",        color: "#22c55e" },
];
```

- [ ] **Step 5: Update parseWorkspaceStatuses in store.ts**

Replace the filter predicate in `parseWorkspaceStatuses` (lines 27-37) to also validate `color`:

```ts
export function parseWorkspaceStatuses(value: unknown): WorkspaceStatus[] {
  if (!Array.isArray(value)) return DEFAULT_WORKSPACE_STATUSES;
  return (value as unknown[]).filter(
    (item): item is WorkspaceStatus =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as WorkspaceStatus).id === "string" &&
      (item as WorkspaceStatus).id.length > 0 &&
      typeof (item as WorkspaceStatus).label === "string" &&
      (
        (item as WorkspaceStatus).color === undefined ||
        typeof (item as WorkspaceStatus).color === "string"
      ),
  );
}
```

- [ ] **Step 6: Add resolveStatusColor and randomStatusColor to workspaceColor.ts**

Append to `src/modules/workspaces/lib/workspaceColor.ts`:

```ts
/**
 * Resolves the display color for a status.
 * Unlike workspace color, there is no "no color" (null) option — statuses always show a color.
 * Falls back to a stable color derived from the status ID when no explicit color is set.
 */
export function resolveStatusColor(color: string | undefined, id: string): string {
  return color ?? initialColorForId(id);
}

/**
 * Picks a random color from WORKSPACE_COLOR_PALETTE for use when creating a new status.
 */
export function randomStatusColor(): string {
  return WORKSPACE_COLOR_PALETTE[
    Math.floor(Math.random() * WORKSPACE_COLOR_PALETTE.length)
  ]!;
}
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 8: Type check**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm check-types 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
git add src/modules/settings/store.ts \
        src/modules/settings/store.test.ts \
        src/modules/workspaces/lib/workspaceColor.ts
git commit -m "feat(status): add color field to WorkspaceStatus and resolver helpers"
```

---

### Task 2: Settings UI — color swatch per status row

**Files:**
- Modify: `src/settings/sections/WorkspacesSection.tsx`

**Interfaces:**
- Consumes:
  - `WorkspaceStatus` with `color?: string` (from Task 1)
  - `resolveStatusColor(color, id): string` from `@/modules/workspaces/lib/workspaceColor`
  - `randomStatusColor(): string` from `@/modules/workspaces/lib/workspaceColor`
  - `WORKSPACE_COLOR_PALETTE` from `@/modules/workspaces/lib/workspaceColor`
  - `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`

- [ ] **Step 1: Update imports in WorkspacesSection.tsx**

Add the new imports at the top of `src/settings/sections/WorkspacesSection.tsx`:

```ts
import {
  WORKSPACE_COLOR_PALETTE,
  randomStatusColor,
  resolveStatusColor,
} from "@/modules/workspaces/lib/workspaceColor";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
```

Also remove `setRandomWorkspaceColor` and `setWarnOnCloseWorkspace` from the store import if they're no longer used in this file — but they ARE still used, so leave them. Just add the new imports above or merge into existing import groups.

- [ ] **Step 2: Add handleUpdateColor to WorkspacesSection**

Inside the `WorkspacesSection` function body, add after the existing `handleUpdate` function:

```ts
function handleUpdateColor(id: string, color: string) {
  persist(statuses.map((s) => (s.id === id ? { ...s, color } : s)));
}
```

- [ ] **Step 3: Update handleAdd to assign a random color**

Change the existing `handleAdd` function body — replace the `next` assignment:

```ts
// Before
const next: WorkspaceStatus = { id: newStatusId(), label: "" };

// After
const next: WorkspaceStatus = { id: newStatusId(), label: "", color: randomStatusColor() };
```

- [ ] **Step 4: Update SortableStatusRow signature**

Add `onUpdateColor` to the `SortableStatusRow` props interface:

```ts
function SortableStatusRow({
  index,
  status,
  onUpdate,
  onUpdateColor,
  onRemove,
  inputRef,
}: {
  index: number;
  status: WorkspaceStatus;
  onUpdate: (label: string) => void;
  onUpdateColor: (color: string) => void;
  onRemove: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
```

- [ ] **Step 5: Add color swatch inside SortableStatusRow JSX**

Replace the `return (` JSX block of `SortableStatusRow` with the updated version that includes the swatch before the index number:

```tsx
  const resolvedColor = resolveStatusColor(status.color, status.id);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0">
        <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Change color"
            className="size-[22px] shrink-0 rounded-full border border-border/60 transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ backgroundColor: resolvedColor }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-4 gap-1.5">
            {WORKSPACE_COLOR_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                onClick={() => onUpdateColor(hex)}
                className="size-6 rounded-full border-2 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: hex,
                  borderColor: status.color === hex ? "white" : "transparent",
                  outline: status.color === hex ? `2px solid ${hex}` : "none",
                }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <span className="w-6 shrink-0 text-right text-[11px] text-muted-foreground/60 select-none">
        #{index + 1}
      </span>
      <input
        ref={inputRef}
        className={INPUT_CLASS}
        placeholder="Status name"
        spellCheck={false}
        defaultValue={status.label}
        onBlur={(e) => onUpdate(e.target.value)}
      />
      <button
        type="button"
        title="Remove status"
        onClick={onRemove}
        className="size-[22px] shrink-0 flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
      </button>
    </div>
  );
```

- [ ] **Step 6: Pass onUpdateColor in the render loop**

In the `WorkspacesSection` JSX where `SortableStatusRow` is rendered, add the `onUpdateColor` prop:

```tsx
<SortableStatusRow
  key={status.id}
  index={i}
  status={status}
  onUpdate={(label) => handleUpdate(status.id, label)}
  onUpdateColor={(color) => handleUpdateColor(status.id, color)}
  onRemove={() => handleRemove(status.id)}
  inputRef={(el) => {
    if (el) inputRefs.current.set(status.id, el);
    else inputRefs.current.delete(status.id);
  }}
/>
```

- [ ] **Step 7: Type check**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm check-types 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 8: Lint**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm exec biome lint ./src 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
git add src/settings/sections/WorkspacesSection.tsx
git commit -m "feat(status): add color swatch and popover picker to status settings rows"
```

---

### Task 3: WorkspaceBar — colored indicator in group headers and context menu

**Files:**
- Modify: `src/app/components/WorkspaceBar.tsx`

**Interfaces:**
- Consumes:
  - `WorkspaceStatus` with `color?: string` (from Task 1)
  - `resolveStatusColor(color, id): string` from `@/modules/workspaces/lib/workspaceColor`
  - `workspaceStatuses: WorkspaceStatus[]` is already passed as a prop to `WorkspaceBar`

- [ ] **Step 1: Add resolveStatusColor import to WorkspaceBar.tsx**

In the imports at the top of `src/app/components/WorkspaceBar.tsx`, add `resolveStatusColor` to the existing import from `workspaceColor`:

```ts
import { resolveWorkspaceColor, resolveStatusColor } from "@/modules/workspaces/lib/workspaceColor";
```

- [ ] **Step 2: Add color dot to context menu radio items**

Find the section in `SortableWorkspaceItem` that renders `ContextMenuRadioItem` for each status (around line 262):

```tsx
{workspaceStatuses.map((s) => (
  <ContextMenuRadioItem key={s.id} value={s.id}>
    {s.label}
  </ContextMenuRadioItem>
))}
```

Replace with:

```tsx
{workspaceStatuses.map((s) => (
  <ContextMenuRadioItem key={s.id} value={s.id} className="gap-2">
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: resolveStatusColor(s.color, s.id) }}
    />
    {s.label}
  </ContextMenuRadioItem>
))}
```

- [ ] **Step 3: Add colored bar to expanded group headers in WorkspaceBar**

Find the non-compact group header button (around line 514-537) — the one that renders `ChevronRightIcon` + label + count. Add the color bar **between** the chevron and the label span:

```tsx
<button
  type="button"
  onClick={() => onToggleGroup(group.id)}
  className="flex w-full items-center gap-1 px-1.5 pt-2 pb-0.5 text-left transition-colors hover:text-foreground/80"
>
  <HugeiconsIcon
    icon={ChevronRightIcon}
    size={10}
    strokeWidth={2}
    className={cn(
      "shrink-0 text-muted-foreground/60 transition-transform duration-150",
      !isCollapsed && "rotate-90",
    )}
  />
  {(() => {
    const st = workspaceStatuses.find((s) => s.id === group.id);
    if (!st) return null;
    return (
      <span
        className="h-3 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: resolveStatusColor(st.color, st.id) }}
      />
    );
  })()}
  <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
    {group.label}
  </span>
  {group.items.length > 0 && (
    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">
      {group.items.length}
    </span>
  )}
</button>
```

- [ ] **Step 4: Type check**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm check-types 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
git add src/app/components/WorkspaceBar.tsx
git commit -m "feat(status): show color indicator in WorkspaceBar group headers and context menu"
```

---

### Task 4: Header badge — GitHub-label style colored background

**Files:**
- Modify: `src/modules/header/WorkspaceTitle.tsx`

**Interfaces:**
- Consumes:
  - `WorkspaceStatus` with `color?: string` (from Task 1)
  - `resolveStatusColor(color, id): string` from `@/modules/workspaces/lib/workspaceColor`
  - `status` local variable already resolved as `WorkspaceStatus | null` (existing code)

- [ ] **Step 1: Add resolveStatusColor import to WorkspaceTitle.tsx**

In `src/modules/header/WorkspaceTitle.tsx`, extend the existing import from `workspaceColor`:

```ts
import { resolveWorkspaceColor, resolveStatusColor } from "@/modules/workspaces/lib/workspaceColor";
```

- [ ] **Step 2: Compute status color and replace badge JSX**

The existing status badge in `WorkspaceTitle` (around line 51-55):

```tsx
{status && (
  <span className="shrink-0 rounded border border-border/70 px-1 py-0.5 text-[9.5px] font-medium uppercase tracking-wide leading-none text-muted-foreground">
    {status.label}
  </span>
)}
```

Replace with:

```tsx
{status && (() => {
  const statusColor = resolveStatusColor(status.color, status.id);
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide leading-none"
      style={{ backgroundColor: statusColor, color: "white" }}
    >
      {status.label}
    </span>
  );
})()}
```

- [ ] **Step 3: Type check**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm check-types 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Lint**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
pnpm exec biome lint ./src 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/state-color
git add src/modules/header/WorkspaceTitle.tsx
git commit -m "feat(status): style header status badge as GitHub-style colored label"
```

---

## Self-Review Notes

**Spec coverage:**
- [x] `color?: string` on `WorkspaceStatus` — Task 1
- [x] `parseWorkspaceStatuses` validates color — Task 1
- [x] `DEFAULT_WORKSPACE_STATUSES` with semantic colors — Task 1
- [x] `resolveStatusColor` + `randomStatusColor` — Task 1
- [x] Random color on status creation — Task 2
- [x] Color swatch + palette popover in Settings — Task 2
- [x] Colored bar in WorkspaceBar group headers — Task 3
- [x] Colored dot in context menu items — Task 3
- [x] GitHub-label style colored badge in Header — Task 4
- [x] Tests updated for new color field — Task 1

**Type consistency:**
- `resolveStatusColor` defined in Task 1, consumed in Tasks 2, 3, 4 — all use `(color: string | undefined, id: string): string` signature.
- `randomStatusColor` defined in Task 1, consumed in Task 2 — `(): string`, matches.
- `WorkspaceStatus.color` is `string | undefined` everywhere — consistent.
