# Copy Toast + Custom Tools Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show rich toast notifications on every copy-path/URL action, and improve the custom tools UX in Settings (shown first, drag to reorder, red border on incomplete rows, Add button focuses incomplete tool instead of being disabled).

**Architecture:** (1) Extend `copyToClipboard(text, label?)` in `contextActions.ts` with an optional label that fires a Sonner toast title + description; update every call site to pass the label that matches the menu item text. (2) In `ExternalEditorsSection`, move custom tools to the top of the section, wrap the list in `@dnd-kit/sortable` for reordering, drive the border color from local input state, and replace the disabled-Add pattern with a focus-incomplete-or-new-tool approach using a `nameInputRefs` map and a `pendingFocusId` state.

**Tech Stack:** React 19, TypeScript, Sonner (already used project-wide), @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities (already installed), HugeIcons (`Drag04Icon`)

## Global Constraints

- No em-dash anywhere in code, comments, or labels
- No emojis
- No "Co-authored-by" in commits
- Commit messages in English, one logical change per commit
- Toast labels sentence-case: "Copied current path", "Copied relative path", "Copied absolute path", "Copied current URL"
- All imports use `@/...` aliases, never relative across modules

---

### Task 1: Toast notifications on all copy path/URL actions

**Files:**
- Modify: `src/modules/explorer/lib/contextActions.ts`
- Modify: `src/app/App.tsx` (around line 2083)
- Modify: `src/modules/explorer/TreeRow.tsx` (lines 432, 439, 653, 736)
- Modify: `src/modules/explorer/ExplorerSearch.tsx` (lines 433, 441)
- Modify: `src/modules/explorer/FileExplorer.tsx` (line 1383)
- Modify: `src/modules/workspaces/pathbar/segmentMenuItems.tsx` (functions `copyRelativeItem` and `copyAbsoluteItem`)
- Modify: `src/modules/source-control/SourceControlPanel.tsx` (lines 1579, 1587)

**Interfaces:**
- Produces: `copyToClipboard(text: string, label?: string): Promise<void>` - existing callers still work unchanged; callers that pass `label` get a `toast.success(label, { description: text })` after writing

- [ ] **Step 1: Extend copyToClipboard with optional toast label**

Full new content of `src/modules/explorer/lib/contextActions.ts`:

```ts
import { IS_MAC } from "@/lib/platform";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

export const REVEAL_LABEL = IS_MAC
  ? "Reveal in Finder"
  : "Reveal in File Manager";

export async function copyToClipboard(text: string, label?: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    if (label) toast.success(label, { description: text });
  } catch {
    // Best-effort; ignore in environments without clipboard permission.
  }
}

export function relativePath(rootPath: string, path: string): string {
  if (path === rootPath) return ".";
  if (path.startsWith(`${rootPath}/`)) return path.slice(rootPath.length + 1);
  return path;
}

export async function revealInFinder(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch (e) {
    console.error("revealItemInDir failed:", e);
  }
}
```

- [ ] **Step 2: Update path.copy shortcut handler in App.tsx**

Add this import near the other module imports at the top of `src/app/App.tsx` (there is currently no import from contextActions; add it):

```ts
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
```

Replace the `"path.copy"` handler (currently around line 2083). The old block:
```ts
"path.copy": () => {
  if (!activePanel) return;
  let path: string | undefined;
  if (activePanel.kind === "editor" || activePanel.kind === "markdown") {
    path = activePanel.path;
  } else if (activePanel.kind === "terminal") {
    path = activePanel.cwd;
  } else if (activePanel.kind === "browser") {
    path = activePanel.url;
  }
  if (!path) return;
  void navigator.clipboard.writeText(path).then(() => {
    toast.success("Path copied");
  });
},
```

New block:
```ts
"path.copy": () => {
  if (!activePanel) return;
  let value: string | undefined;
  let label: string;
  if (activePanel.kind === "editor" || activePanel.kind === "markdown") {
    value = activePanel.path;
    label = "Copied current path";
  } else if (activePanel.kind === "terminal") {
    value = activePanel.cwd;
    label = "Copied current path";
  } else if (activePanel.kind === "browser") {
    value = activePanel.url;
    label = "Copied current URL";
  } else {
    return;
  }
  if (!value) return;
  void copyToClipboard(value, label);
},
```

Note: `toast` is still imported and used elsewhere in App.tsx (lines 1296, 1514, 1534) - do NOT remove the `toast` import.

- [ ] **Step 3: Update TreeRow.tsx copy calls**

In `src/modules/explorer/TreeRow.tsx`, four changes:

Line 432 - Copy Relative Path (file row):
```ts
onSelect={() => void copyToClipboard(relativePath(rootPath, path), "Copied relative path")}
```

Line 439 - Copy Absolute Path (file row):
```ts
onSelect={() => void copyToClipboard(path, "Copied absolute path")}
```

Line 653 - Copy Absolute Path (folder context):
```ts
onSelect={() => void copyToClipboard(path, "Copied absolute path")}
```

Line 736 - Copy Absolute Path (another folder context):
```ts
onSelect={() => void copyToClipboard(path, "Copied absolute path")}
```

- [ ] **Step 4: Update ExplorerSearch.tsx copy calls**

In `src/modules/explorer/ExplorerSearch.tsx`, two changes:

Line 433 - Copy Relative Path:
```ts
void copyToClipboard(relativePath(rootPath, contextHit.path), "Copied relative path")
```

Line 441 - Copy Absolute Path:
```ts
onSelect={() => contextHit && void copyToClipboard(contextHit.path, "Copied absolute path")}
```

- [ ] **Step 5: Update FileExplorer.tsx copy call**

In `src/modules/explorer/FileExplorer.tsx`, line 1383 - Copy Absolute Path on root folder:
```ts
onSelect={() => void copyToClipboard(rootPath, "Copied absolute path")}
```

- [ ] **Step 6: Update segmentMenuItems.tsx copy helpers**

In `src/modules/workspaces/pathbar/segmentMenuItems.tsx`:

Inside `copyRelativeItem` (around line 47), where `copyToClipboard(relText)` is called:
```ts
if (relText != null) void copyToClipboard(relText, "Copied relative path");
```

Inside `copyAbsoluteItem` (around line 67), the `onSelect`:
```ts
onSelect={() => void copyToClipboard(path, "Copied absolute path")}
```

- [ ] **Step 7: Update SourceControlPanel.tsx copy calls**

In `src/modules/source-control/SourceControlPanel.tsx`:

Line 1579 - Copy Relative Path:
```ts
onSelect={() => void copyToClipboard(entry.path.replace(/\\/g, "/"), "Copied relative path")}
```

Line 1587 - Copy Absolute Path:
```ts
onSelect={() => void copyToClipboard(absolutePath, "Copied absolute path")}
```

- [ ] **Step 8: Verify**

```bash
pnpm check-types
pnpm exec biome lint ./src
```

Expected: no errors in either command.

- [ ] **Step 9: Commit**

```bash
git add src/modules/explorer/lib/contextActions.ts \
        src/app/App.tsx \
        src/modules/explorer/TreeRow.tsx \
        src/modules/explorer/ExplorerSearch.tsx \
        src/modules/explorer/FileExplorer.tsx \
        src/modules/workspaces/pathbar/segmentMenuItems.tsx \
        src/modules/source-control/SourceControlPanel.tsx
git commit -m "feat: show toast with copied value on all copy path/URL actions"
```

---

### Task 2: Custom tools - move to top, drag to reorder, red border, smart Add button

**Files:**
- Modify: `src/settings/sections/ExternalEditorsSection.tsx`

**Interfaces:**
- Consumes from `@dnd-kit/core`: `DndContext`, `closestCenter`, `PointerSensor`, `useSensor`, `useSensors`, `type DragEndEvent`
- Consumes from `@dnd-kit/sortable`: `SortableContext`, `verticalListSortingStrategy`, `useSortable`, `arrayMove`
- Consumes from `@dnd-kit/utilities`: `CSS`
- Consumes: `Drag04Icon` from `@hugeicons/core-free-icons`

- [ ] **Step 1: Add new imports to ExternalEditorsSection.tsx**

Add these imports after the existing import block:

```tsx
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
import { Drag04Icon } from "@hugeicons/core-free-icons";
import type { CSSProperties } from "react";
```

Also add `useCallback` to the existing React import on line 1:
```tsx
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: Replace CustomEditorRow with the sortable version**

Replace the entire `CustomEditorRow` function with this new version. Changes: adds `useSortable`, drag handle button, `onRegisterNameRef` prop, and border color driven by local state.

```tsx
function CustomEditorRow({
  editor,
  onUpdate,
  onDelete,
  onRegisterNameRef,
}: {
  editor: CustomEditor;
  onUpdate: (id: string, partial: Partial<Pick<CustomEditor, "name" | "binary" | "argsBeforePath" | "targetKind">>) => void;
  onDelete: (id: string) => void;
  onRegisterNameRef: (id: string, el: HTMLInputElement | null) => void;
}) {
  const [name, setName] = useState(editor.name);
  const [binary, setBinary] = useState(editor.binary);
  const [args, setArgs] = useState(editor.argsBeforePath.join(" "));

  const isIncomplete = !name.trim() || !binary.trim();

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: editor.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-2.5 rounded-lg border bg-card/40 px-3 py-3 ${
        isIncomplete ? "border-destructive/60" : "border-border/60"
      }`}
    >
      {/* Row 1: drag handle + Name + Opens + delete */}
      <div className="flex items-end gap-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          title="Drag to reorder"
          className="mb-[7px] flex size-[22px] shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <HugeiconsIcon icon={Drag04Icon} size={12} strokeWidth={2} />
        </button>
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Name</span>
          <input
            type="text"
            ref={(el) => onRegisterNameRef(editor.id, el)}
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            onBlur={() => onUpdate(editor.id, { name })}
            placeholder="My Tool"
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Opens</span>
          <Select
            value={editor.targetKind ?? "file"}
            onValueChange={(v) =>
              onUpdate(editor.id, { targetKind: v as "file" | "workspace" | "workspace-and-files" })
            }
          >
            <SelectTrigger size="sm" className="h-8 w-full text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="file" className="text-[12px]">Opens single files only</SelectItem>
              <SelectItem value="workspace" className="text-[12px]">Opens workspace root only</SelectItem>
              <SelectItem value="workspace-and-files" className="text-[12px]">Opens workspace root and files too</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          title="Remove"
          onClick={() => onDelete(editor.id)}
          className="mb-[7px] flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
        </button>
      </div>
      {/* Row 2: Command + Args */}
      <div className="flex items-end gap-2">
        {/* spacer aligned with drag handle above */}
        <div className="size-[22px] shrink-0" />
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Command</span>
          <input
            type="text"
            value={binary}
            onChange={(ev) => setBinary(ev.target.value)}
            onBlur={() => onUpdate(editor.id, { binary })}
            placeholder="subl, /usr/local/bin/tool"
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Args</span>
          <input
            type="text"
            value={args}
            onChange={(ev) => setArgs(ev.target.value)}
            onBlur={() =>
              onUpdate(editor.id, { argsBeforePath: args.split(/\s+/).filter(Boolean) })
            }
            placeholder="--wait"
            className={INPUT_CLASS}
          />
        </div>
        {/* spacer aligned with delete button above */}
        <div className="size-[22px] shrink-0" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update ExternalEditorsSection body**

Inside the `ExternalEditorsSection` function, make these changes:

**a) Remove this line** (no longer needed):
```tsx
const hasIncompleteCustomTool = customEditors.some((e) => !e.name.trim() || !e.binary.trim());
```

**b) Add sensors, nameInputRefs, pendingFocusId, and handleDragEnd** after the existing state/effect declarations:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
);

const nameInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
const handleRegisterNameRef = useCallback(
  (id: string, el: HTMLInputElement | null) => {
    if (el) nameInputRefs.current.set(id, el);
    else nameInputRefs.current.delete(id);
  },
  [],
);

const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
useEffect(() => {
  if (!pendingFocusId) return;
  const el = nameInputRefs.current.get(pendingFocusId);
  if (el) {
    el.focus();
    setPendingFocusId(null);
  }
}, [pendingFocusId, customEditors]);

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const oldIndex = customEditors.findIndex((e) => e.id === String(active.id));
  const newIndex = customEditors.findIndex((e) => e.id === String(over.id));
  if (oldIndex !== -1 && newIndex !== -1) {
    void setCustomEditors(arrayMove(customEditors, oldIndex, newIndex));
  }
}
```

**c) Replace `handleAddCustom`**:

Old:
```tsx
function handleAddCustom() {
  const id = crypto.randomUUID();
  void setCustomEditors([...customEditors, { id, name: "", binary: "", argsBeforePath: [], targetKind: "file" }]);
}
```

New:
```tsx
function handleAddCustom() {
  const incomplete = customEditors.find((e) => !e.name.trim() || !e.binary.trim());
  if (incomplete) {
    nameInputRefs.current.get(incomplete.id)?.focus();
    return;
  }
  const id = crypto.randomUUID();
  void setCustomEditors([...customEditors, { id, name: "", binary: "", argsBeforePath: [], targetKind: "file" }]);
  setPendingFocusId(id);
}
```

**d) Update the JSX** - move the custom tools block BEFORE `{ALL_GROUPS.map(...)}`, and wrap the list in `DndContext` + `SortableContext`. Remove `disabled={hasIncompleteCustomTool}` from the Add button.

The returned JSX should look like this (showing both the custom block now first and the Add button change):

```tsx
return (
  <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between">
      <SectionHeader title="Tools" />
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-[11px]"
        onClick={scan}
        disabled={isScanning}
      >
        <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
        {isScanning ? "Scanning..." : "Scan"}
      </Button>
    </div>

    <p className="text-[11.5px] text-muted-foreground -mt-2">
      Use the header button to open files or folders in an external tool.
      Select your preferred tool from that button&apos;s dropdown.
    </p>

    {/* Custom tools - shown first */}
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Custom tools
      </h3>

      {customEditors.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={customEditors.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {customEditors.map((e) => (
                <CustomEditorRow
                  key={e.id}
                  editor={e}
                  onUpdate={handleUpdateCustom}
                  onDelete={handleDeleteCustom}
                  onRegisterNameRef={handleRegisterNameRef}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-fit gap-1.5 px-2 text-[12px]"
        onClick={handleAddCustom}
      >
        <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
        Add tool
      </Button>
    </div>

    {ALL_GROUPS.map((group) => (
      <GroupSection
        key={group}
        group={group}
        detectedIds={detectedIds}
        disabledDetectedEditorIds={disabledDetectedEditorIds}
        onToggle={handleToggleDetected}
        headerExtra={
          group === "Text Editors" ? (
            <RadioGroup
              value={textEditorMode}
              onValueChange={(v) => handleTextEditorModeChange(v as TextEditorMode)}
              className="mt-1.5 gap-1.5"
            >
              {TEXT_EDITOR_MODE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`text-editor-mode-${opt.value}`} />
                  <label
                    htmlFor={`text-editor-mode-${opt.value}`}
                    className="cursor-pointer text-[12px]"
                  >
                    {opt.label}
                  </label>
                </div>
              ))}
            </RadioGroup>
          ) : undefined
        }
      />
    ))}
  </div>
);
```

- [ ] **Step 4: Verify**

```bash
pnpm check-types
pnpm exec biome lint ./src
```

Expected: no errors in either command.

- [ ] **Step 5: Commit**

```bash
git add src/settings/sections/ExternalEditorsSection.tsx
git commit -m "feat: custom tools first, draggable, red border on incomplete, smart Add button"
```
