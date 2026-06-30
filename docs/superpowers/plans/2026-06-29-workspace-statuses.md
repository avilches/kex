# Workspace Statuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a workspace status system: a global list of statuses in Settings, per-workspace status assignment in Properties, and grouped sidebar with multi-container drag-and-drop.

**Architecture:** `WorkspaceStatus[]` lives in `Preferences` (settings-general.json). `Workspace` gains `statusId?: string`. The sidebar derives groups at render time from the statuses order; dragging between groups calls `onSetStatus`.

**Tech Stack:** TypeScript, React 19, @dnd-kit/core + @dnd-kit/sortable, tauri-plugin-store, Vitest.

## Global Constraints

- No em-dash anywhere: code, comments, commits, docs
- No backward-compatibility shims or migrations
- Entity IDs via `nid()` — use dedicated `new*Id()` exports from `src/lib/ids.ts`
- All frontend imports use `@/...` alias, never relative across modules
- shadcn/ui primitives from `src/components/ui/`; icons from `@hugeicons/core-free-icons`
- pnpm only — never npm/npx/yarn
- Quality checks before every commit: `pnpm check-types`, `pnpm lint`, `pnpm test`
- No `crypto.randomUUID()` or `Math.random()` for entity IDs
- No comments unless the WHY is non-obvious

---

### Task 1: Data model foundations

**Files:**
- Modify: `src/lib/ids.ts`
- Modify: `src/modules/workspaces/lib/types.ts`

**Interfaces:**
- Produces: `newStatusId(): string` exported from `src/lib/ids.ts`
- Produces: `Workspace.statusId?: string` field

- [ ] **Step 1: Add newStatusId to ids.ts**

Open `src/lib/ids.ts`. Add after the last export line:

```ts
export const newStatusId    = () => `st-${nid()}`;
```

- [ ] **Step 2: Add statusId to Workspace type**

Open `src/modules/workspaces/lib/types.ts`. In the `Workspace` type, add `statusId?: string` after `icon?: string`:

```ts
export type Workspace = {
  id: string;
  title: string;
  cwd?: string;
  paneTree: SplitNode;
  activePaneId: string;
  explorerRootMode?: ExplorerRootMode;
  showHidden?: boolean;
  pinnedRoot?: string;
  fsRoot?: string;
  git?: WorkspaceGitConfig;
  color?: string | null;
  icon?: string;
  statusId?: string;
  scripts?: RunConfig[];
  activeScript?: string;
  scriptPaneId?: string;
};
```

- [ ] **Step 3: Type-check**

```bash
pnpm check-types
```

Expected: no errors from these changes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ids.ts src/modules/workspaces/lib/types.ts
git commit -m "feat(workspaces): add statusId to Workspace type and newStatusId generator"
```

---

### Task 2: WorkspaceStatus in the preferences store

**Files:**
- Modify: `src/modules/settings/store.ts`
- Modify: `src/modules/settings/store.test.ts`

**Interfaces:**
- Produces: `WorkspaceStatus` type: `{ id: string; label: string }`
- Produces: `DEFAULT_WORKSPACE_STATUSES: WorkspaceStatus[]`
- Produces: `parseWorkspaceStatuses(value: unknown): WorkspaceStatus[]`
- Produces: `Preferences.workspaceStatuses: WorkspaceStatus[]`
- Produces: `setWorkspaceStatuses(value: WorkspaceStatus[]): Promise<void>`

- [ ] **Step 1: Write failing tests**

Add to `src/modules/settings/store.test.ts` (extend the existing imports line):

```ts
import {
  clampToStep,
  CURSOR_INACTIVE_STYLE_DEFAULT,
  CURSOR_STYLE_DEFAULT,
  LETTER_SPACING_MIN,
  LETTER_SPACING_MAX,
  LETTER_SPACING_STEP,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
  parseCursorInactiveStyle,
  parseCursorStyle,
  parseScmViewMode,
  parseTerminalNewFolderMode,
  DEFAULT_PREFERENCES,
  PREF_KEY_MAP,
  parseWorkspaceStatuses,
  DEFAULT_WORKSPACE_STATUSES,
} from "./store";
```

Then add these test suites at the end of the file:

```ts
describe("parseWorkspaceStatuses", () => {
  it("returns DEFAULT_WORKSPACE_STATUSES when value is not an array", () => {
    expect(parseWorkspaceStatuses(undefined)).toEqual(DEFAULT_WORKSPACE_STATUSES);
    expect(parseWorkspaceStatuses(null)).toEqual(DEFAULT_WORKSPACE_STATUSES);
    expect(parseWorkspaceStatuses("foo")).toEqual(DEFAULT_WORKSPACE_STATUSES);
    expect(parseWorkspaceStatuses(42)).toEqual(DEFAULT_WORKSPACE_STATUSES);
  });

  it("filters out items with missing or non-string id/label", () => {
    const input = [
      { id: "a", label: "A" },
      { id: "", label: "B" },
      { id: "c" },
      { label: "D" },
      { id: "e", label: "E" },
    ];
    expect(parseWorkspaceStatuses(input)).toEqual([
      { id: "a", label: "A" },
      { id: "e", label: "E" },
    ]);
  });

  it("returns an empty array when all items are invalid", () => {
    expect(parseWorkspaceStatuses([{ id: "", label: "bad" }])).toEqual([]);
  });

  it("accepts a valid array as-is", () => {
    const input = [{ id: "archived", label: "Archived" }];
    expect(parseWorkspaceStatuses(input)).toEqual(input);
  });
});

describe("DEFAULT_WORKSPACE_STATUSES", () => {
  it("contains the five predefined statuses in order", () => {
    const ids = DEFAULT_WORKSPACE_STATUSES.map((s) => s.id);
    expect(ids).toEqual([
      "archived",
      "work-in-progress",
      "on-hold",
      "canceled",
      "completed",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test -- store.test
```

Expected: FAIL with "parseWorkspaceStatuses is not exported" / "DEFAULT_WORKSPACE_STATUSES is not exported".

- [ ] **Step 3: Add WorkspaceStatus type, constants, and parser to store.ts**

Open `src/modules/settings/store.ts`. After the `TabBarStyle` type definition (around line 20), add:

```ts
export type WorkspaceStatus = { id: string; label: string };

export const DEFAULT_WORKSPACE_STATUSES: WorkspaceStatus[] = [
  { id: "archived",         label: "Archived" },
  { id: "work-in-progress", label: "Work in progress" },
  { id: "on-hold",          label: "On hold" },
  { id: "canceled",         label: "Canceled" },
  { id: "completed",        label: "Completed" },
];

export function parseWorkspaceStatuses(value: unknown): WorkspaceStatus[] {
  if (!Array.isArray(value)) return DEFAULT_WORKSPACE_STATUSES;
  return (value as unknown[]).filter(
    (item): item is WorkspaceStatus =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as WorkspaceStatus).id === "string" &&
      (item as WorkspaceStatus).id.length > 0 &&
      typeof (item as WorkspaceStatus).label === "string",
  );
}
```

- [ ] **Step 4: Add workspaceStatuses to Preferences and DEFAULT_PREFERENCES**

In the `Preferences` type, add after `detectedEditors: DetectedEditor[]`:

```ts
workspaceStatuses: WorkspaceStatus[];
```

In `DEFAULT_PREFERENCES`, add after `detectedEditors: []`:

```ts
workspaceStatuses: DEFAULT_WORKSPACE_STATUSES,
```

- [ ] **Step 5: Add store key, load logic, key map entry, and setter**

Add key constant after `const KEY_PREVIEW_ON_CLICK`:

```ts
const KEY_WORKSPACE_STATUSES = "workspaceStatuses";
```

In `loadPreferences()`, add `workspaceStatuses` to the result object after `detectedEditors`:

```ts
workspaceStatuses: (() => {
  const v = get<WorkspaceStatus[]>(KEY_WORKSPACE_STATUSES);
  if (v === undefined) return DEFAULT_WORKSPACE_STATUSES;
  return parseWorkspaceStatuses(v);
})(),
```

In `GENERAL_PREF_KEY_MAP`, add after `[KEY_PREVIEW_ON_CLICK]`:

```ts
[KEY_WORKSPACE_STATUSES]: "workspaceStatuses",
```

After `setDetectedEditors`, add the setter:

```ts
export async function setWorkspaceStatuses(value: WorkspaceStatus[]): Promise<void> {
  await writePref(KEY_WORKSPACE_STATUSES, value);
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm test -- store.test
```

Expected: PASS for all new tests.

- [ ] **Step 7: Full quality check**

```bash
pnpm check-types && pnpm lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/modules/settings/store.ts src/modules/settings/store.test.ts
git commit -m "feat(settings): add WorkspaceStatus type and workspaceStatuses preference"
```

---

### Task 3: useWorkspaces - applyWorkspaceStatus action

**Files:**
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`
- Modify: `src/modules/workspaces/lib/useWorkspaces.test.ts`

**Interfaces:**
- Consumes: `Workspace.statusId` from Task 1
- Produces: `applyWorkspaceStatus(workspaces: Workspace[], workspaceId: string, statusId: string | null | undefined): Workspace[]`
- Produces: `setWorkspaceStatus(workspaceId: string, statusId: string | null): void` in `UseWorkspacesReturn`

- [ ] **Step 1: Write failing test**

In `src/modules/workspaces/lib/useWorkspaces.test.ts`, extend the import line:

```ts
import {
  applyClosePanel,
  applyExplorerRootMode,
  applyFsRoot,
  applyGitConfig,
  applyPinnedRoot,
  applyShowHidden,
  applyWorkspaceStatus,
  captureClosedEntry,
  collectRunningTerminals,
  findReopenTarget,
  pushMru,
  MRU_HISTORY_LIMIT,
} from "./useWorkspaces";
```

Add at the end of the file:

```ts
describe("applyWorkspaceStatus", () => {
  it("sets statusId on the matching workspace only", () => {
    const out = applyWorkspaceStatus([ws(), ws({ id: "w2" })], "w1", "archived");
    expect(out[0].statusId).toBe("archived");
    expect(out[1].statusId).toBeUndefined();
  });

  it("clears statusId when null is passed", () => {
    const out = applyWorkspaceStatus([ws({ statusId: "archived" })], "w1", null);
    expect(out[0].statusId).toBeUndefined();
  });

  it("clears statusId when undefined is passed", () => {
    const out = applyWorkspaceStatus([ws({ statusId: "archived" })], "w1", undefined);
    expect(out[0].statusId).toBeUndefined();
  });

  it("does not modify unrelated workspaces", () => {
    const out = applyWorkspaceStatus([ws(), ws({ id: "w2", statusId: "completed" })], "w1", "on-hold");
    expect(out[1].statusId).toBe("completed");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm test -- useWorkspaces.test
```

Expected: FAIL with "applyWorkspaceStatus is not exported".

- [ ] **Step 3: Add applyWorkspaceStatus pure function**

In `src/modules/workspaces/lib/useWorkspaces.ts`, add after `applyGitConfig` (around line 120):

```ts
export function applyWorkspaceStatus(
  workspaces: Workspace[],
  workspaceId: string,
  statusId: string | null | undefined,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, statusId: statusId ?? undefined } : w,
  );
}
```

- [ ] **Step 4: Add setWorkspaceStatus hook action**

Inside `useWorkspaces`, after `setWorkspaceIcon` (around line 671):

```ts
const setWorkspaceStatus = useCallback((workspaceId: string, statusId: string | null) => {
  setWorkspaces((prev) => applyWorkspaceStatus(prev, workspaceId, statusId));
}, []);
```

Add `setWorkspaceStatus` to the return object, after `setWorkspaceIcon`:

```ts
setWorkspaceStatus,
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm test -- useWorkspaces.test
```

Expected: PASS for all new tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspaces/lib/useWorkspaces.ts src/modules/workspaces/lib/useWorkspaces.test.ts
git commit -m "feat(workspaces): add applyWorkspaceStatus and setWorkspaceStatus action"
```

---

### Task 4: Settings - WorkspacesSection + tab registration

**Files:**
- Modify: `src/modules/settings/openSettingsWindow.ts`
- Modify: `src/settings/SettingsApp.tsx`
- Create: `src/settings/sections/WorkspacesSection.tsx`

**Interfaces:**
- Consumes: `WorkspaceStatus`, `setWorkspaceStatuses` from Task 2; `newStatusId` from Task 1; `usePreferencesStore` from `@/modules/settings/preferences`
- Produces: `WorkspacesSection` component; `"workspaces"` in `SettingsTab`

- [ ] **Step 1: Add "workspaces" to SettingsTab**

In `src/modules/settings/openSettingsWindow.ts`, update the `SettingsTab` union:

```ts
export type SettingsTab =
  | "general"
  | "workspaces"
  | "editor"
  | "filetypes"
  | "terminal"
  | "appearance"
  | "themes"
  | "shortcuts"
  | "external-editors"
  | "about";
```

- [ ] **Step 2: Create WorkspacesSection.tsx**

Create `src/settings/sections/WorkspacesSection.tsx` with this full content:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cancel01Icon, DragDropVerticalIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setWorkspaceStatuses, type WorkspaceStatus } from "@/modules/settings/store";
import { newStatusId } from "@/lib/ids";
import { SectionHeader } from "../components/SectionHeader";
import { cn } from "@/lib/utils";

const INPUT_CLASS =
  "h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function SortableStatusRow({
  status,
  onUpdate,
  onRemove,
  inputRef,
}: {
  status: WorkspaceStatus;
  onUpdate: (label: string) => void;
  onRemove: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: status.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0">
        <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
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
}

export function WorkspacesSection() {
  const stored = usePreferencesStore((s) => s.workspaceStatuses);
  const [statuses, setStatuses] = useState<WorkspaceStatus[]>(stored);
  const statusesRef = useRef(statuses);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  useEffect(() => {
    return () => {
      const cleaned = statusesRef.current.filter((s) => s.label.trim());
      if (cleaned.length !== statusesRef.current.length) {
        void setWorkspaceStatuses(cleaned);
      }
    };
  }, []);

  function persist(next: WorkspaceStatus[]) {
    setStatuses(next);
    void setWorkspaceStatuses(next);
  }

  function handleUpdate(id: string, label: string) {
    persist(statuses.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  function handleRemove(id: string) {
    persist(statuses.filter((s) => s.id !== id));
  }

  function handleAdd() {
    const empty = statuses.find((s) => !s.label.trim());
    if (empty) {
      inputRefs.current.get(empty.id)?.focus();
      return;
    }
    const next: WorkspaceStatus = { id: newStatusId(), label: "" };
    const updated = [...statuses, next];
    setStatuses(updated);
    void setWorkspaceStatuses(updated);
    requestAnimationFrame(() => {
      inputRefs.current.get(next.id)?.focus();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = statuses.findIndex((s) => s.id === active.id);
    const to = statuses.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;
    persist(arrayMove(statuses, from, to));
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Workspaces" />

      <div className="flex flex-col gap-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={statuses.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1.5">
              {statuses.map((status) => (
                <SortableStatusRow
                  key={status.id}
                  status={status}
                  onUpdate={(label) => handleUpdate(status.id, label)}
                  onRemove={() => handleRemove(status.id)}
                  inputRef={(el) => {
                    if (el) inputRefs.current.set(status.id, el);
                    else inputRefs.current.delete(status.id);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-fit gap-1.5 px-2 text-[12px]"
            onClick={handleAdd}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
            Add status
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register section in SettingsApp.tsx**

In `src/settings/SettingsApp.tsx`:

Add to the existing icon import block (from `@hugeicons/core-free-icons`):
```ts
Layers01Icon,
```

Add the component import after the other section imports:
```ts
import { WorkspacesSection } from "./sections/WorkspacesSection";
```

In the `SECTIONS` array, add after the `general` entry:
```ts
{ id: "workspaces", label: "Workspaces", icon: Layers01Icon, component: WorkspacesSection },
```

- [ ] **Step 4: Quality check**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/settings/openSettingsWindow.ts src/settings/SettingsApp.tsx src/settings/sections/WorkspacesSection.tsx
git commit -m "feat(settings): add Workspaces section with status management"
```

---

### Task 5: WorkspaceSettingsDialog - status pill selector

**Files:**
- Modify: `src/app/components/WorkspaceSettingsDialog.tsx`

**Interfaces:**
- Consumes: `WorkspaceStatus` from Task 2; `Workspace.statusId` from Task 1
- Produces: updated `Props` with `workspaceStatuses: WorkspaceStatus[]` and `onSetStatus: (id: string, statusId: string | null) => void`

- [ ] **Step 1: Add WorkspaceStatus import**

In `src/app/components/WorkspaceSettingsDialog.tsx`, add to the existing store import:

```ts
import type { WorkspaceStatus } from "@/modules/settings/store";
```

- [ ] **Step 2: Add new fields to Props type**

Update the `Props` type:

```ts
type Props = {
  workspaces: Workspace[];
  workspaceStatuses: WorkspaceStatus[];
  onSetTitle: (id: string, title: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetStatus: (id: string, statusId: string | null) => void;
  onSetPinnedRoot: (id: string, path: string | undefined) => void;
  onAddRunConfig: (id: string, config: RunConfig) => void;
  onUpdateRunConfig: (id: string, configId: string, patch: Partial<RunConfig>) => void;
  onRemoveRunConfig: (id: string, configId: string) => void;
  onReorderRunConfigs: (id: string, fromId: string, toId: string) => void;
};
```

(`FormProps` uses `Omit<Props, "workspaces">` spread so the new props propagate automatically — no change needed there.)

- [ ] **Step 3: Add status pill selector in properties tab**

In `WorkspaceSettingsForm`, in the `activeTab === "properties"` block, add the Status section after the Color section (after the closing `</div>` of the Color block):

```tsx
{props.workspaceStatuses.length > 0 && (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-medium">Status</label>
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        title="No status"
        onClick={() => props.onSetStatus(ws.id, null)}
        className={cn(
          "size-6 rounded-full border-2 flex items-center justify-center bg-muted text-muted-foreground transition-colors",
          !ws.statusId
            ? "border-foreground"
            : "border-transparent hover:border-muted-foreground/50",
        )}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
      </button>
      {props.workspaceStatuses.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => props.onSetStatus(ws.id, s.id)}
          className={cn(
            "rounded-full border-2 px-2.5 py-0.5 text-[11px] font-medium transition-colors",
            ws.statusId === s.id
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Type-check (errors expected in App.tsx)**

```bash
pnpm check-types
```

Expected: type errors about missing `workspaceStatuses` and `onSetStatus` props in `App.tsx` — this is expected and will be fixed in Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/WorkspaceSettingsDialog.tsx
git commit -m "feat(workspaces): add status pill selector in workspace properties"
```

---

### Task 6: WorkspaceSidebar - grouped rendering and multi-container DnD

**Files:**
- Modify: `src/app/components/WorkspaceSidebar.tsx`

**Interfaces:**
- Consumes: `WorkspaceStatus` from Task 2
- Produces: updated `WorkspaceItem` with `statusId?: string`; updated `WorkspaceSidebarProps` with `workspaceStatuses` and `onSetStatus`

- [ ] **Step 1: Update imports**

In `src/app/components/WorkspaceSidebar.tsx`, update the React import to include `useMemo`:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

Update the `@dnd-kit/core` import to add `DragOverlay` and `DragStartEvent` (add to the existing import):

```ts
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
```

Add the `WorkspaceStatus` import:

```ts
import type { WorkspaceStatus } from "@/modules/settings/store";
```

- [ ] **Step 2: Update WorkspaceItem and WorkspaceSidebarProps**

Update `WorkspaceItem`:

```ts
type WorkspaceItem = {
  id: string;
  title: string;
  kind: string;
  cwd?: string;
  color?: string | null;
  statusId?: string;
};
```

Update `WorkspaceSidebarProps`:

```ts
export type WorkspaceSidebarProps = {
  workspaces: WorkspaceItem[];
  activeId: string | null;
  workspaceStatuses: WorkspaceStatus[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onReorder: (fromId: string, toId: string) => void;
  onSetStatus: (id: string, statusId: string | null) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenSettings: (id: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
};
```

- [ ] **Step 3: Replace WorkspaceSidebar function body**

Replace the entire `WorkspaceSidebar` function with:

```tsx
export function WorkspaceSidebar({
  workspaces,
  activeId,
  workspaceStatuses,
  onSelect,
  onNew,
  onReorder,
  onSetStatus,
  onClose,
  onRename,
  onOpenSettings,
  width,
  onWidthChange,
}: WorkspaceSidebarProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [isDragging, setIsDragging] = useState(false);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const compact = width <= 80;

  const groups = useMemo(() => {
    const validIds = new Set(workspaceStatuses.map((s) => s.id));
    const noStatus = workspaces.filter((w) => !w.statusId || !validIds.has(w.statusId));
    const result: Array<{ id: string; label: string | null; items: WorkspaceItem[] }> = [];
    if (noStatus.length > 0) result.push({ id: "__none__", label: null, items: noStatus });
    for (const status of workspaceStatuses) {
      const members = workspaces.filter((w) => w.statusId === status.id);
      if (members.length > 0) result.push({ id: status.id, label: status.label, items: members });
    }
    return result;
  }, [workspaces, workspaceStatuses]);

  function findGroupId(itemId: string): string | null {
    for (const g of groups) {
      if (g.items.some((w) => w.id === itemId)) return g.id;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setIsDragging(true);
    setDragActiveId(String(event.active.id));
  }

  function handleDragCancel() {
    setIsDragging(false);
    setDragActiveId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false);
    setDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeGroupId = findGroupId(String(active.id));
    const overGroupId = findGroupId(String(over.id));
    if (activeGroupId === null || overGroupId === null) return;
    if (activeGroupId !== overGroupId) {
      onSetStatus(String(active.id), overGroupId === "__none__" ? null : overGroupId);
    } else {
      onReorder(String(active.id), String(over.id));
    }
  }

  const dragActiveWs = dragActiveId ? workspaces.find((w) => w.id === dragActiveId) : null;

  return (
    <nav
      aria-label="Workspaces"
      className={cn(
        "relative flex shrink-0 flex-col items-center gap-1.5 border-r border-border/60 bg-card/60 py-2",
        isDragging && "[&_*]:!cursor-grabbing cursor-grabbing",
      )}
      style={{ width }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {groups.map((group) => (
          <div key={group.id} className="w-full">
            {group.label !== null && (
              compact ? (
                <div className="mx-1.5 my-1 h-px bg-border/40" />
              ) : (
                <div className="px-2.5 pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 truncate">
                  {group.label}
                </div>
              )
            )}
            <SortableContext
              items={group.items.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              {group.items.map((ws) => (
                <SortableWorkspaceItem
                  key={ws.id}
                  ws={ws}
                  active={ws.id === activeId}
                  sidebarWidth={width}
                  onSelect={onSelect}
                  onClose={onClose}
                  onRename={onRename}
                  onOpenSettings={onOpenSettings}
                />
              ))}
            </SortableContext>
          </div>
        ))}

        <DragOverlay dropAnimation={null}>
          {dragActiveWs ? (() => {
            const displayColor = resolveWorkspaceColor(dragActiveWs.color, dragActiveWs.id);
            return (
              <div
                className={cn(
                  "flex items-center justify-center rounded-lg font-semibold opacity-90",
                  compact ? "h-9 w-9 text-[11px]" : "h-9 px-2 text-[11px]",
                )}
                style={
                  displayColor
                    ? { backgroundColor: displayColor, color: "white" }
                    : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))" }
                }
              >
                {compact
                  ? abbrev(dragActiveWs.title, dragActiveWs.kind)
                  : <span className="max-w-full truncate text-center">{dragActiveWs.title || dragActiveWs.kind}</span>
                }
              </div>
            );
          })() : null}
        </DragOverlay>
      </DndContext>

      <div className="flex-1" />
      <button
        type="button"
        title="New workspace (Cmd+N)"
        onClick={onNew}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border/60 text-lg text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        +
      </button>

      <div
        className="absolute inset-y-0 right-0 flex w-1 cursor-ew-resize items-center justify-center outline-none hover:bg-primary/20 active:bg-primary/30"
        onPointerDown={(e) => {
          const startX = e.clientX;
          const startWidth = width;
          e.currentTarget.setPointerCapture(e.pointerId);
          const onMove = (ev: PointerEvent) => {
            const next = Math.min(220, Math.max(52, startWidth + (ev.clientX - startX)));
            onWidthChange(next);
          };
          const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
          };
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
        }}
      >
        <div className="pointer-events-none h-6 w-0.5 rounded-full bg-border" />
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Quality check**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: type errors in App.tsx about missing props (expected). Tests pass. Lint passes.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/WorkspaceSidebar.tsx
git commit -m "feat(workspaces): group sidebar by status with multi-container DnD"
```

---

### Task 7: App.tsx wiring

**Files:**
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `setWorkspaceStatus` from Task 3; `workspaceStatuses` from `usePreferencesStore` (Task 2); updated prop types from Tasks 5 and 6

- [ ] **Step 1: Read workspaceStatuses and hydrated from preferences store**

In `src/app/App.tsx`, find the block where `usePreferencesStore` values are read. Add:

```ts
const workspaceStatuses = usePreferencesStore((s) => s.workspaceStatuses);
const prefsHydrated = usePreferencesStore((s) => s.hydrated);
```

- [ ] **Step 2: Destructure setWorkspaceStatus from useWorkspaces**

Find the destructuring of `useWorkspaces(...)`. Add `setWorkspaceStatus` to it:

```ts
setWorkspaceStatus,
```

- [ ] **Step 3: Add statusId to WorkspaceItem map for WorkspaceSidebar**

Find the `workspaces.map((w) => ({...}))` call inside `<WorkspaceSidebar workspaces={...}>` (around line 2584). Add `statusId`:

```ts
workspaces={workspaces.map((w) => ({
  id: w.id,
  title: w.title,
  kind: "terminal",
  cwd: w.cwd,
  color: w.color,
  icon: w.icon,
  statusId: w.statusId,
}))}
```

- [ ] **Step 4: Pass new props to WorkspaceSidebar**

In the `<WorkspaceSidebar>` JSX, add after `onReorder`:

```tsx
workspaceStatuses={workspaceStatuses}
onSetStatus={setWorkspaceStatus}
```

- [ ] **Step 5: Pass new props to WorkspaceSettingsDialog**

In the `<WorkspaceSettingsDialog>` JSX, add after `workspaces={workspaces}`:

```tsx
workspaceStatuses={workspaceStatuses}
onSetStatus={setWorkspaceStatus}
```

- [ ] **Step 6: Add startup normalization for orphaned statusIds**

Find the `useEffect` that calls `void init()` (preferences initialization). After it, add a new effect:

```ts
useEffect(() => {
  if (!prefsHydrated) return;
  const validIds = new Set(workspaceStatuses.map((s) => s.id));
  for (const w of workspaces) {
    if (w.statusId && !validIds.has(w.statusId)) {
      setWorkspaceStatus(w.id, null);
    }
  }
}, [prefsHydrated]);
```

- [ ] **Step 7: Full quality check**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: all pass with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(workspaces): wire workspace status through App"
```
