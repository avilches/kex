# Source Control Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-list-with-checkboxes layout with a VS Code-style two-section panel (Staged Changes / Changes) with explicit +/- action buttons and collapsible sections.

**Architecture:** Rewrite `SourceControlPanel.tsx` to render two collapsible virtualizer sections using `SourceControlEntry[]` (already split into `stagedEntries`/`unstagedEntries` by the hook). The hook exposes all needed primitives; only the UI layer changes. Then remove dead exports from the hook.

**Tech Stack:** React 19, TypeScript, @tanstack/react-virtual, @hugeicons/react (Hugeicons free tier)

## Global Constraints

- pnpm only (never npm/npx/yarn)
- Path imports: always `@/...`, never relative across modules
- No em-dash anywhere, no emojis anywhere
- Run `pnpm lint && pnpm check-types` after each task before committing
- No new dependencies

---

### Task 1: Rewrite SourceControlPanel.tsx with two-section design

**Files:**
- Modify: `src/modules/source-control/SourceControlPanel.tsx`

**Interfaces:**
- Consumes from hook (already exist): `scm.stagedEntries: SourceControlEntry[]`, `scm.unstagedEntries: SourceControlEntry[]`, `scm.stageEntry(entry)`, `scm.unstageEntry(entry)`, `scm.stageAllEntries()`, `scm.unstageAllEntries()`, `scm.requestDiscardEntry(entry)`, `scm.requestDiscardAll()`, `scm.selectEntry(entry)`, `scm.selected: DiffSelection | null`
- Stops using: `scm.fileEntries`, `scm.toggleStageFile`, `scm.headerCheckState`, `scm.toggleAll`, `scm.requestDiscardFile`
- Produces: fully working two-section panel; hook dead code still exists (cleaned in Task 2)

- [ ] **Step 1: Update imports**

Remove `Checkbox` (no longer used). Add `Add01Icon` and `Minus01Icon` from `@hugeicons/core-free-icons`. Remove `CheckState`, `SourceControlFileEntry` imports from `./useSourceControlPanel`. Add `DiffSelection` import.

```ts
// Remove from @hugeicons/core-free-icons imports:
//   RemoveSquareIcon stays (used for per-file discard)
// Add:
import {
  Add01Icon,
  Minus01Icon,
  // ... keep existing ones
} from "@hugeicons/core-free-icons";

// Remove from ./useSourceControlPanel:
//   CheckState, SourceControlFileEntry
// Add:
import {
  useSourceControlPanel,
  type DiffSelection,
  type SourceControlEntry,
  type PendingDiscard,
} from "./useSourceControlPanel";
```

- [ ] **Step 2: Replace RowDescriptor type and remove helpers**

Replace the existing `RowDescriptor` type and the `checkboxValue` helper (no longer needed):

```ts
type RowDescriptor =
  | { kind: "banner-diverged"; key: string }
  | { kind: "staged-header"; key: string; count: number }
  | { kind: "staged-entry"; key: string; entry: SourceControlEntry }
  | { kind: "changes-header"; key: string; count: number }
  | { kind: "changes-entry"; key: string; entry: SourceControlEntry }

// Delete checkboxValue function entirely
```

- [ ] **Step 3: Add collapsed state to SourceControlPanel**

Inside the `SourceControlPanel` component, after existing state declarations:

```ts
const [stagedCollapsed, setStagedCollapsed] = useState(false);
const [changesCollapsed, setChangesCollapsed] = useState(false);
```

- [ ] **Step 4: Rewrite rows useMemo**

Replace the existing `rows` useMemo entirely:

```ts
const rows = useMemo<RowDescriptor[]>(() => {
  const result: RowDescriptor[] = [];
  if (isDiverged) {
    result.push({ kind: "banner-diverged", key: "banner-diverged" });
  }
  if (scm.stagedEntries.length > 0) {
    result.push({
      kind: "staged-header",
      key: "staged-header",
      count: scm.stagedEntries.length,
    });
    if (!stagedCollapsed) {
      for (const entry of scm.stagedEntries) {
        result.push({ kind: "staged-entry", key: entry.key, entry });
      }
    }
  }
  if (scm.unstagedEntries.length > 0) {
    result.push({
      kind: "changes-header",
      key: "changes-header",
      count: scm.unstagedEntries.length,
    });
    if (!changesCollapsed) {
      for (const entry of scm.unstagedEntries) {
        result.push({ kind: "changes-entry", key: entry.key, entry });
      }
    }
  }
  return result;
}, [isDiverged, scm.stagedEntries, scm.unstagedEntries, stagedCollapsed, changesCollapsed]);
```

- [ ] **Step 5: Update estimateSize, focusableIndices, focusedEntry**

```ts
const estimateSize = useCallback(
  (index: number) => {
    const row = rows[index];
    if (!row) return ROW_HEIGHTS.entry;
    switch (row.kind) {
      case "banner-diverged": return ROW_HEIGHTS.banner;
      case "staged-header":
      case "changes-header": return ROW_HEIGHTS.header;
      case "staged-entry":
      case "changes-entry": return ROW_HEIGHTS.entry;
    }
  },
  [rows],
);

const focusableIndices = useMemo(() => {
  const out: number[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "staged-entry" || row.kind === "changes-entry") out.push(index);
  });
  return out;
}, [rows]);

const focusedEntry = useCallback((): SourceControlEntry | null => {
  if (!focusedRowKey) return null;
  const index = rowKeyToIndex.get(focusedRowKey);
  if (index === undefined) return null;
  const row = rows[index];
  return row && (row.kind === "staged-entry" || row.kind === "changes-entry")
    ? row.entry
    : null;
}, [focusedRowKey, rowKeyToIndex, rows]);
```

- [ ] **Step 6: Rewrite keyboard handler**

Replace the Space/s, d, and Enter cases in `handlePanelKeyDown`:

```ts
case "Enter": {
  const entry = focusedEntry();
  if (entry) {
    event.preventDefault();
    void scm.selectEntry(entry);
  }
  break;
}
case " ":
case "s":
case "S": {
  if (meta) break;
  if (!focusedRowKey) break;
  const idx = rowKeyToIndex.get(focusedRowKey);
  if (idx === undefined) break;
  const row = rows[idx];
  event.preventDefault();
  if (row?.kind === "staged-entry") {
    void scm.unstageEntry(row.entry);
  } else if (row?.kind === "changes-entry") {
    void scm.stageEntry(row.entry);
  }
  break;
}
case "d":
case "D": {
  if (meta) break;
  if (!focusedRowKey) break;
  const idx = rowKeyToIndex.get(focusedRowKey);
  if (idx === undefined) break;
  const row = rows[idx];
  if (row?.kind === "changes-entry") {
    event.preventDefault();
    scm.requestDiscardEntry(row.entry);
  }
  break;
}
```

- [ ] **Step 7: Update RowRenderer props type and call site**

Replace `RowRendererProps`:

```ts
type RowRendererProps = {
  row: RowDescriptor;
  focused: boolean;
  selected: DiffSelection | null;
  actionBusy: string | null;
  repoRoot: string | null;
  stagedCollapsed: boolean;
  changesCollapsed: boolean;
  onFocusRow: (key: string | null) => void;
  onToggleStagedCollapsed: () => void;
  onToggleChangesCollapsed: () => void;
  onSelectEntry: (entry: SourceControlEntry) => Promise<void>;
  onStageEntry: (entry: SourceControlEntry) => Promise<void>;
  onUnstageEntry: (entry: SourceControlEntry) => Promise<void>;
  onDiscardEntry: (entry: SourceControlEntry) => void;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onDiscardAll: () => void;
  onOpenFile?: (absolutePath: string) => void;
};
```

Update the `<RowRenderer>` call site inside the virtualizer map:

```tsx
<RowRenderer
  row={row}
  focused={focusedRowKey === row.key}
  selected={scm.selected}
  actionBusy={scm.actionBusy}
  repoRoot={scm.repo?.repoRoot ?? null}
  stagedCollapsed={stagedCollapsed}
  changesCollapsed={changesCollapsed}
  onFocusRow={setFocusedRowKey}
  onToggleStagedCollapsed={() => setStagedCollapsed((v) => !v)}
  onToggleChangesCollapsed={() => setChangesCollapsed((v) => !v)}
  onSelectEntry={scm.selectEntry}
  onStageEntry={scm.stageEntry}
  onUnstageEntry={scm.unstageEntry}
  onDiscardEntry={scm.requestDiscardEntry}
  onStageAll={scm.stageAllEntries}
  onUnstageAll={scm.unstageAllEntries}
  onDiscardAll={scm.requestDiscardAll}
  onOpenFile={onOpenFile}
/>
```

- [ ] **Step 8: Update RowRenderer switch**

```ts
const RowRenderer = memo(function RowRenderer(props: RowRendererProps) {
  const { row } = props;
  switch (row.kind) {
    case "banner-diverged":
      return <DivergedBanner />;
    case "staged-header":
      return <StagedSectionHeader {...props} row={row} />;
    case "changes-header":
      return <ChangesSectionHeader {...props} row={row} />;
    case "staged-entry":
      return <StagedEntryRow {...props} row={row} />;
    case "changes-entry":
      return <ChangesEntryRow {...props} row={row} />;
  }
});
```

- [ ] **Step 9: Add StagedSectionHeader component**

Replace the old `ListHeader` component with two new ones. Add `StagedSectionHeader`:

```tsx
function StagedSectionHeader({
  row,
  actionBusy,
  stagedCollapsed,
  onToggleStagedCollapsed,
  onUnstageAll,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "staged-header" }>;
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      className="group flex h-[30px] cursor-pointer select-none items-center gap-2 px-2 hover:bg-accent/20"
      onClick={onToggleStagedCollapsed}
    >
      <HugeiconsIcon
        icon={stagedCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
        size={10}
        strokeWidth={2.3}
        className="shrink-0 text-muted-foreground"
      />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
        Staged Changes
      </span>
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-[9.5px] font-semibold tabular-nums text-muted-foreground">
        {row.count}
      </span>
      <div
        className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <IconActionButton
          label="Unstage all"
          disabled={actionBusy !== null}
          side="bottom"
          onClick={() => void onUnstageAll()}
        >
          <HugeiconsIcon icon={Minus01Icon} size={11} strokeWidth={1.9} />
        </IconActionButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Add ChangesSectionHeader component**

```tsx
function ChangesSectionHeader({
  row,
  actionBusy,
  changesCollapsed,
  onToggleChangesCollapsed,
  onStageAll,
  onDiscardAll,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "changes-header" }>;
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      className="group flex h-[30px] cursor-pointer select-none items-center gap-2 px-2 hover:bg-accent/20"
      onClick={onToggleChangesCollapsed}
    >
      <HugeiconsIcon
        icon={changesCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
        size={10}
        strokeWidth={2.3}
        className="shrink-0 text-muted-foreground"
      />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
        Changes
      </span>
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-[9.5px] font-semibold tabular-nums text-muted-foreground">
        {row.count}
      </span>
      <div
        className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <IconActionButton
          label="Discard all changes"
          disabled={actionBusy !== null}
          side="bottom"
          onClick={() => onDiscardAll()}
        >
          <HugeiconsIcon icon={RemoveSquareIcon} size={11} strokeWidth={1.9} />
        </IconActionButton>
        <IconActionButton
          label="Stage all changes"
          disabled={actionBusy !== null}
          side="bottom"
          onClick={() => void onStageAll()}
        >
          <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={1.9} />
        </IconActionButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Add StagedEntryRow component**

Delete the old `EntryRow` component. Add `StagedEntryRow`:

```tsx
const StagedEntryRow = memo(function StagedEntryRow({
  row,
  focused,
  selected,
  actionBusy,
  repoRoot,
  onFocusRow,
  onSelectEntry,
  onUnstageEntry,
  onOpenFile,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "staged-entry" }>;
}) {
  const entry = row.entry;
  const isSelected = selected?.path === entry.path && selected?.mode === "+";
  const fileName = basename(entry.path);
  const iconUrl = fileIconUrl(fileName);
  const pathLabel = entry.originalPath
    ? `${entry.originalPath} -> ${entry.path}`
    : dirname(entry.path);
  const isBusy = actionBusy === `unstage:${entry.path}`;
  const disabled = actionBusy !== null;
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const statusHex = gitStatusHexColor(entry.statusCode as GitStatusCode, gitColorScheme);
  const absolutePath = repoRoot
    ? joinPath(repoRoot.replace(/\\/g, "/"), entry.path.replace(/\\/g, "/"))
    : null;
  const isDeleted = entry.statusCode === "D";
  const revealLabel = IS_MAC ? "Reveal in Finder" : "Reveal in File Manager";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`scm-row-${row.key}`}
          data-focused={focused || undefined}
          data-selected={isSelected || undefined}
          role="option"
          aria-selected={isSelected}
          onMouseDown={() => onFocusRow(row.key)}
          className={cn(
            "group relative flex h-[30px] items-center gap-2 rounded-md pl-2 pr-2 transition-all duration-100",
            focused
              ? "bg-accent/60"
              : isSelected
                ? "bg-accent/55 text-foreground"
                : "hover:bg-accent/30",
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full transition-opacity",
              statusHex ? undefined : statusAccentClass(entry.statusCode),
              isSelected || focused ? "opacity-100" : "opacity-55 group-hover:opacity-95",
            )}
            style={statusHex ? { backgroundColor: statusHex } : undefined}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => { onFocusRow(row.key); void onSelectEntry(entry); }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-none">
              <span
                className={cn(
                  "truncate text-[12px] leading-tight",
                  isSelected || focused ? "font-semibold text-foreground" : "font-medium text-foreground/95",
                  pathLabel ? "max-w-[58%] shrink-0" : "min-w-0 flex-1",
                )}
                style={{
                  color: statusHex ?? undefined,
                  textDecoration: isDeleted ? "line-through" : undefined,
                }}
              >
                {fileName}
              </span>
              {pathLabel ? (
                <span className="min-w-0 flex-1 truncate text-[10.5px] leading-tight text-muted-foreground/75">
                  {pathLabel}
                </span>
              ) : null}
            </div>
          </button>
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 data-[focused=true]:opacity-100 data-[selected=true]:opacity-100">
            <IconActionButton
              label={`Unstage ${entry.path}`}
              disabled={disabled}
              side="top"
              onClick={() => void onUnstageEntry(entry)}
            >
              {isBusy ? (
                <Spinner className="size-3" />
              ) : (
                <HugeiconsIcon icon={Minus01Icon} size={11} strokeWidth={1.9} />
              )}
            </IconActionButton>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => { onFocusRow(row.key); void onSelectEntry(entry); }}
        >
          Open Diff
        </ContextMenuItem>
        {!isDeleted && onOpenFile && absolutePath ? (
          <ContextMenuItem className={COMPACT_ITEM} onSelect={() => onOpenFile(absolutePath)}>
            Open File
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          disabled={disabled}
          onSelect={() => void onUnstageEntry(entry)}
        >
          Unstage
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => void copyToClipboard(entry.path.replace(/\\/g, "/"))}
        >
          Copy Relative Path
        </ContextMenuItem>
        {absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(absolutePath)}
          >
            Copy Absolute Path
          </ContextMenuItem>
        ) : null}
        {!isDeleted && absolutePath ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => void revealInFinder(absolutePath)}
            >
              {revealLabel}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});
```

- [ ] **Step 12: Add ChangesEntryRow component**

```tsx
const ChangesEntryRow = memo(function ChangesEntryRow({
  row,
  focused,
  selected,
  actionBusy,
  repoRoot,
  onFocusRow,
  onSelectEntry,
  onStageEntry,
  onDiscardEntry,
  onOpenFile,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "changes-entry" }>;
}) {
  const entry = row.entry;
  const isSelected = selected?.path === entry.path && selected?.mode === "-";
  const fileName = basename(entry.path);
  const iconUrl = fileIconUrl(fileName);
  const pathLabel = entry.originalPath
    ? `${entry.originalPath} -> ${entry.path}`
    : dirname(entry.path);
  const isStageBusy = actionBusy === `stage:${entry.path}`;
  const isDiscardBusy = actionBusy === `discard:${entry.path}`;
  const disabled = actionBusy !== null;
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const statusHex = gitStatusHexColor(entry.statusCode as GitStatusCode, gitColorScheme);
  const absolutePath = repoRoot
    ? joinPath(repoRoot.replace(/\\/g, "/"), entry.path.replace(/\\/g, "/"))
    : null;
  const isDeleted = entry.statusCode === "D";
  const revealLabel = IS_MAC ? "Reveal in Finder" : "Reveal in File Manager";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`scm-row-${row.key}`}
          data-focused={focused || undefined}
          data-selected={isSelected || undefined}
          role="option"
          aria-selected={isSelected}
          onMouseDown={() => onFocusRow(row.key)}
          className={cn(
            "group relative flex h-[30px] items-center gap-2 rounded-md pl-2 pr-2 transition-all duration-100",
            focused
              ? "bg-accent/60"
              : isSelected
                ? "bg-accent/55 text-foreground"
                : "hover:bg-accent/30",
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full transition-opacity",
              statusHex ? undefined : statusAccentClass(entry.statusCode),
              isSelected || focused ? "opacity-100" : "opacity-55 group-hover:opacity-95",
            )}
            style={statusHex ? { backgroundColor: statusHex } : undefined}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => { onFocusRow(row.key); void onSelectEntry(entry); }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-none">
              <span
                className={cn(
                  "truncate text-[12px] leading-tight",
                  isSelected || focused ? "font-semibold text-foreground" : "font-medium text-foreground/95",
                  pathLabel ? "max-w-[58%] shrink-0" : "min-w-0 flex-1",
                )}
                style={{
                  color: statusHex ?? undefined,
                  textDecoration: isDeleted ? "line-through" : undefined,
                }}
              >
                {fileName}
              </span>
              {pathLabel ? (
                <span className="min-w-0 flex-1 truncate text-[10.5px] leading-tight text-muted-foreground/75">
                  {pathLabel}
                </span>
              ) : null}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[focused=true]:opacity-100 data-[selected=true]:opacity-100">
            <IconActionButton
              label={`Discard ${entry.path}`}
              disabled={disabled}
              side="top"
              onClick={() => onDiscardEntry(entry)}
            >
              {isDiscardBusy ? (
                <Spinner className="size-3" />
              ) : (
                <HugeiconsIcon icon={RemoveSquareIcon} size={11} strokeWidth={1.9} />
              )}
            </IconActionButton>
            <IconActionButton
              label={`Stage ${entry.path}`}
              disabled={disabled}
              side="top"
              onClick={() => void onStageEntry(entry)}
            >
              {isStageBusy ? (
                <Spinner className="size-3" />
              ) : (
                <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={1.9} />
              )}
            </IconActionButton>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => { onFocusRow(row.key); void onSelectEntry(entry); }}
        >
          Open Diff
        </ContextMenuItem>
        {!isDeleted && onOpenFile && absolutePath ? (
          <ContextMenuItem className={COMPACT_ITEM} onSelect={() => onOpenFile(absolutePath)}>
            Open File
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          disabled={disabled}
          onSelect={() => void onStageEntry(entry)}
        >
          Stage
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          variant="destructive"
          disabled={disabled}
          onSelect={() => onDiscardEntry(entry)}
        >
          Discard Changes
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => void copyToClipboard(entry.path.replace(/\\/g, "/"))}
        >
          Copy Relative Path
        </ContextMenuItem>
        {absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(absolutePath)}
          >
            Copy Absolute Path
          </ContextMenuItem>
        ) : null}
        {!isDeleted && absolutePath ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => void revealInFinder(absolutePath)}
            >
              {revealLabel}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});
```

- [ ] **Step 13: Fix canCommit and allClean references**

The existing `canCommit` already uses `scm.stagedEntries.length > 0` - verify this is correct and keep it.

`scm.allClean` already returns `stagedEntries.length === 0 && unstagedEntries.length === 0` - keep it.

The `pendingDiscard` dialog uses `scm.pendingDiscard` (a view type `PendingDiscard`) and `scm.confirmPendingDiscard()` / `scm.cancelPendingDiscard()` - these are unchanged and still work.

- [ ] **Step 14: Verify icons exist and run type check**

```bash
cd /path/to/repo
pnpm check-types 2>&1 | head -40
```

If `Add01Icon` or `Minus01Icon` are not found, search the Hugeicons package:

```bash
node -e "const icons = require('@hugeicons/core-free-icons'); console.log(Object.keys(icons).filter(k => k.toLowerCase().includes('add') || k.toLowerCase().includes('plus')).slice(0,10))"
node -e "const icons = require('@hugeicons/core-free-icons'); console.log(Object.keys(icons).filter(k => k.toLowerCase().includes('minus') || k.toLowerCase().includes('subtract')).slice(0,10))"
```

Use the correct icon names from the output and update the imports accordingly.

- [ ] **Step 15: Run lint**

```bash
pnpm lint
```

Fix any lint errors before committing.

- [ ] **Step 16: Commit**

```bash
git add src/modules/source-control/SourceControlPanel.tsx
git commit -m "feat(source-control): redesign panel with VS Code-style two-section layout"
```

---

### Task 2: Remove dead code from useSourceControlPanel.ts

**Files:**
- Modify: `src/modules/source-control/useSourceControlPanel.ts`

**Interfaces:**
- Removes from public API: `fileEntries`, `toggleStageFile`, `headerCheckState`, `toggleAll`, `requestDiscardFile`, `SourceControlFileEntry`, `CheckState`
- Task 1 must be complete before starting this task (panel no longer references these)

- [ ] **Step 1: Remove SourceControlFileEntry type**

Delete the entire `SourceControlFileEntry` type definition (lines 42-52 in the original file).

- [ ] **Step 2: Remove CheckState type and checkboxValue usage**

Delete the `CheckState` type export:
```ts
// Delete this line:
export type CheckState = "checked" | "indeterminate" | "unchecked";
```

- [ ] **Step 3: Remove fileEntries useMemo**

Delete the entire `fileEntries` useMemo block (the one that builds `SourceControlFileEntry[]`).

- [ ] **Step 4: Remove headerCheckState useMemo**

Delete the `headerCheckState` useMemo block.

- [ ] **Step 5: Remove dead functions**

Delete these four functions entirely:
- `toggleStageFile`
- `toggleAll`
- `requestDiscardFile`

(Keep `requestDiscardEntry`, `requestDiscardAll`, `stageEntry`, `unstageEntry`, etc. - those are still used.)

- [ ] **Step 6: Remove from SourceControlPanelState type**

In the `SourceControlPanelState` type, remove these fields:
```ts
// Remove:
fileEntries: SourceControlFileEntry[];
headerCheckState: CheckState;
toggleStageFile: (entry: SourceControlFileEntry) => Promise<void>;
toggleAll: () => Promise<void>;
requestDiscardFile: (entry: SourceControlFileEntry) => void;
stagedEmptyText: string;
unstagedEmptyText: string;
```

`stagedEmptyText` and `unstagedEmptyText` were defined but never used in the new panel - remove them too.

- [ ] **Step 7: Remove from return object**

In the `return` statement of `useSourceControlPanel`, remove:
```ts
// Remove:
fileEntries,
headerCheckState,
toggleStageFile,
toggleAll,
requestDiscardFile,
stagedEmptyText,
unstagedEmptyText,
```

- [ ] **Step 8: Run type check and lint**

```bash
pnpm check-types 2>&1 | head -40
pnpm lint
```

Fix any remaining errors.

- [ ] **Step 9: Commit**

```bash
git add src/modules/source-control/useSourceControlPanel.ts
git commit -m "refactor(source-control): remove dead fileEntries/toggleAll/headerCheckState from hook"
```
