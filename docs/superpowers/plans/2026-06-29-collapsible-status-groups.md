# Collapsible Status Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to collapse/expand workspace status groups in the sidebar, persisting the state per window, skipping collapsed groups in keyboard navigation, and auto-expanding when a workspace in a collapsed group becomes active.

**Architecture:** New `collapsed_status_groups: Vec<String>` field added to both `WindowEntry` and `IndexEntry` in Rust, mirroring the existing `workspace_sidebar_width` pattern. Frontend holds a `Set<string>` in App.tsx state, saved via a debounced Tauri invoke. WorkspaceSidebar receives the set as a prop and renders chevrons + counts on group headers.

**Tech Stack:** Rust (Tauri 2, serde_json), React 19, TypeScript, Tailwind v4, @hugeicons/react

## Global Constraints

- No backwards-compat code, no shims, no migration logic.
- No `crypto.randomUUID()` — IDs come from Tauri backend or the existing workspace store.
- Commit messages in English, no em-dash, no emojis, no "Co-authored-by".
- All imports on the frontend use `@/...` aliases, never relative across modules.
- No hardcoded shortcuts — all keyboard handlers via the shortcuts registry.
- `pnpm` only (no npm/npx/yarn).
- Run `pnpm exec biome lint ./src` for linting (not `pnpm lint` — see CLAUDE.md note on RTK).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src-tauri/src/modules/window_state.rs` | Modify | Add `collapsed_status_groups` to `WindowEntry`, `IndexEntry`, `Default`, load/save paths, and new `update_collapsed_status_groups` method |
| `src-tauri/src/lib.rs` | Modify | Add `window_save_collapsed_groups` command and register it |
| `src/modules/workspaces/lib/collapsedGroupsState.ts` | Create | Frontend module: get/set/save collapsed groups, mirrors `workspaceSidebarState.ts` |
| `src/modules/workspaces/lib/workspaceState.ts` | Modify | Add `collapsedStatusGroups` to TS `WindowEntry` type; call `setSavedCollapsedGroups` in `initWorkspaceState` |
| `src/app/App.tsx` | Modify | Add `collapsedGroups` state, `handleToggleGroup`, auto-expand effect, filter in `cycleWorkspace`, pass props to `WorkspaceSidebar` |
| `src/app/components/WorkspaceSidebar.tsx` | Modify | Add props `collapsedGroups`/`onToggleGroup`, chevron + count on group headers, compact-mode toggle button, filter items for collapsed groups |

---

### Task 1: Rust — add collapsed_status_groups to window state

**Files:**
- Modify: `src-tauri/src/modules/window_state.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `window_save_collapsed_groups(label: String, ids: Vec<String>)` Tauri command callable from the frontend via `invoke("window_save_collapsed_groups", { label, ids })`.
- Produces: `WindowEntry.collapsed_status_groups: Vec<String>` present in the object returned by `window_get_state`.

- [ ] **Step 1: Add `collapsed_status_groups` to `WindowEntry` in `window_state.rs`**

  In `src-tauri/src/modules/window_state.rs`, find the `WindowEntry` struct (around line 40) and add the new field:

  ```rust
  #[derive(Clone, Debug, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct WindowEntry {
      #[serde(flatten)]
      pub geometry: WindowGeometry,
      pub workspaces: Value,
      pub active_index: usize,
      #[serde(default)]
      pub right_panel: Option<RightPanelState>,
      #[serde(default)]
      pub workspace_sidebar_width: Option<u32>,
      #[serde(default)]
      pub explorer_sidebar_width: Option<u32>,
      #[serde(default)]
      pub collapsed_status_groups: Vec<String>,
  }
  ```

  Update the `Default` impl for `WindowEntry` (around line 53) to add the new field:

  ```rust
  impl Default for WindowEntry {
      fn default() -> Self {
          Self {
              geometry: WindowGeometry::default(),
              workspaces: Value::Array(vec![]),
              active_index: 0,
              right_panel: None,
              workspace_sidebar_width: None,
              explorer_sidebar_width: None,
              collapsed_status_groups: Vec::new(),
          }
      }
  }
  ```

- [ ] **Step 2: Add `collapsed_status_groups` to `IndexEntry` in `window_state.rs`**

  Find the `IndexEntry` struct (around line 81) and add the field:

  ```rust
  #[derive(Clone, Debug, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct IndexEntry {
      #[serde(flatten)]
      geometry: WindowGeometry,
      workspace_ids: Vec<String>,
      active_index: usize,
      #[serde(default)]
      right_panel: Option<RightPanelState>,
      #[serde(default)]
      workspace_sidebar_width: Option<u32>,
      #[serde(default)]
      explorer_sidebar_width: Option<u32>,
      #[serde(default)]
      collapsed_status_groups: Vec<String>,
  }
  ```

- [ ] **Step 3: Thread `collapsed_status_groups` through load and save in `window_state.rs`**

  In the `load` method (around line 221-230), update the `WindowEntry` construction from `IndexEntry`:

  ```rust
  windows.insert(
      label.clone(),
      WindowEntry {
          geometry: ie.geometry.clone(),
          workspaces: Value::Array(bodies),
          active_index: ie.active_index,
          right_panel: ie.right_panel.clone(),
          workspace_sidebar_width: ie.workspace_sidebar_width,
          explorer_sidebar_width: ie.explorer_sidebar_width,
          collapsed_status_groups: ie.collapsed_status_groups.clone(),
      },
  );
  ```

  In the `save` method (around line 290-299), update the `IndexEntry` construction from `WindowEntry`:

  ```rust
  index_windows.insert(
      label.clone(),
      IndexEntry {
          geometry: entry.geometry.clone(),
          workspace_ids: ids,
          active_index: entry.active_index,
          right_panel: entry.right_panel.clone(),
          workspace_sidebar_width: entry.workspace_sidebar_width,
          explorer_sidebar_width: entry.explorer_sidebar_width,
          collapsed_status_groups: entry.collapsed_status_groups.clone(),
      },
  );
  ```

- [ ] **Step 4: Add `update_collapsed_status_groups` method to `WindowStateManager` in `window_state.rs`**

  Add after the existing `update_explorer_sidebar_width` method (around line 409-414):

  ```rust
  pub fn update_collapsed_status_groups(&self, label: &str, ids: Vec<String>) {
      let mut inner = self.inner.write().expect("window state lock poisoned");
      if let Some(entry) = inner.windows.get_mut(label) {
          entry.collapsed_status_groups = ids;
      }
  }
  ```

- [ ] **Step 5: Add `window_save_collapsed_groups` command in `lib.rs`**

  Find the `window_save_explorer_sidebar` command (around line 443) and add right after it:

  ```rust
  #[tauri::command]
  fn window_save_collapsed_groups(app: tauri::AppHandle, label: String, ids: Vec<String>) {
      let mgr = app.state::<window_state::WindowStateManager>();
      mgr.update_collapsed_status_groups(&label, ids);
      mgr.save();
  }
  ```

- [ ] **Step 6: Register the command in `lib.rs`**

  Find the `.invoke_handler(tauri::generate_handler![` block (around line 856-859) and add the new command alongside the other `window_save_*` commands:

  ```rust
  window_save_workspace_state,
  window_save_right_panel,
  window_save_workspace_sidebar,
  window_save_explorer_sidebar,
  window_save_collapsed_groups,
  ```

- [ ] **Step 7: Verify Rust compiles cleanly**

  ```bash
  cd src-tauri && cargo clippy 2>&1 | head -40
  ```

  Expected: no errors, at most pre-existing warnings. No new warnings about unused fields or dead code.

- [ ] **Step 8: Commit**

  ```bash
  git add src-tauri/src/modules/window_state.rs src-tauri/src/lib.rs
  git commit -m "feat(window-state): add collapsed_status_groups persistence per window"
  ```

---

### Task 2: Frontend module — collapsedGroupsState.ts + workspaceState.ts wiring

**Files:**
- Create: `src/modules/workspaces/lib/collapsedGroupsState.ts`
- Modify: `src/modules/workspaces/lib/workspaceState.ts`

**Interfaces:**
- Produces:
  - `setSavedCollapsedGroups(raw: unknown): void` — called once at startup with the raw value from `WindowEntry`
  - `getSavedCollapsedGroups(): string[]` — returns the cached array
  - `saveCollapsedGroups(label: string, ids: string[]): void` — debounced, calls `invoke("window_save_collapsed_groups", { label, ids })`

- [ ] **Step 1: Create `collapsedGroupsState.ts`**

  Create `src/modules/workspaces/lib/collapsedGroupsState.ts`:

  ```typescript
  import { invoke } from "@tauri-apps/api/core";

  let cached: string[] = [];

  export function setSavedCollapsedGroups(raw: unknown): void {
    cached = Array.isArray(raw) && raw.every((x) => typeof x === "string") ? raw : [];
  }

  export function getSavedCollapsedGroups(): string[] {
    return cached;
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: { label: string; ids: string[] } | null = null;

  export function saveCollapsedGroups(label: string, ids: string[]): void {
    pending = { label, ids };
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const p = pending;
      pending = null;
      if (!p) return;
      void invoke("window_save_collapsed_groups", {
        label: p.label,
        ids: p.ids,
      }).catch((err) =>
        console.error("[collapsed-groups-state] save error:", err),
      );
    }, 250);
  }
  ```

- [ ] **Step 2: Wire into `workspaceState.ts`**

  In `src/modules/workspaces/lib/workspaceState.ts`:

  a) Add import at the top alongside the other `setSaved*` imports:

  ```typescript
  import { setSavedCollapsedGroups } from "./collapsedGroupsState";
  ```

  b) Add `collapsedStatusGroups` to the TypeScript `WindowEntry` type (around line 15-21):

  ```typescript
  type WindowEntry = {
    workspaces: Workspace[];
    activeIndex: number;
    rightPanel?: RightPanelUiState;
    workspaceSidebarWidth?: number;
    explorerSidebarWidth?: number;
    collapsedStatusGroups?: string[];
  };
  ```

  c) In `initWorkspaceState` (around line 93-95), add the call after `setSavedExplorerSidebarWidth`:

  ```typescript
  setSavedRightPanelState(entry?.rightPanel);
  setSavedWorkspaceSidebarWidth(entry?.workspaceSidebarWidth);
  setSavedExplorerSidebarWidth(entry?.explorerSidebarWidth);
  setSavedCollapsedGroups(entry?.collapsedStatusGroups);
  ```

- [ ] **Step 3: Type-check**

  ```bash
  pnpm check-types 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/modules/workspaces/lib/collapsedGroupsState.ts src/modules/workspaces/lib/workspaceState.ts
  git commit -m "feat(workspaces): add collapsed status groups state module"
  ```

---

### Task 3: App.tsx — collapsed state, toggle, auto-expand, cycleWorkspace

**Files:**
- Modify: `src/app/App.tsx` (lines ~107-120 for imports, ~447-457 for state, ~1991-1999 for cycleWorkspace, ~2596-2616 for WorkspaceSidebar JSX)

**Interfaces:**
- Consumes: `getSavedCollapsedGroups()`, `saveCollapsedGroups(label, ids)` from `@/modules/workspaces/lib/collapsedGroupsState`
- Produces: `collapsedGroups: Set<string>` and `handleToggleGroup: (statusId: string) => void` passed to `WorkspaceSidebar`

- [ ] **Step 1: Add imports to App.tsx**

  Find the import block for sidebar state modules (around line 107-113):

  ```typescript
  import {
    getSavedWorkspaceSidebarWidth,
    saveWorkspaceSidebarWidth,
  } from "@/modules/workspaces/lib/workspaceSidebarState";
  ```

  Add below it:

  ```typescript
  import {
    getSavedCollapsedGroups,
    saveCollapsedGroups,
  } from "@/modules/workspaces/lib/collapsedGroupsState";
  ```

- [ ] **Step 2: Add `collapsedGroups` state and `handleToggleGroup` callback in App.tsx**

  Find the block where `workspaceSidebarWidth` state and its handler are defined (around line 448-452):

  ```typescript
  const [workspaceSidebarWidth, setWorkspaceSidebarWidth] = useState(getSavedWorkspaceSidebarWidth);
  const handleSidebarWidthChange = useCallback((w: number) => {
    setWorkspaceSidebarWidth(w);
    saveWorkspaceSidebarWidth(windowLabel, w);
  }, [windowLabel]);
  ```

  Add directly after it:

  ```typescript
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(getSavedCollapsedGroups()),
  );
  const handleToggleGroup = useCallback(
    (statusId: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(statusId)) {
          next.delete(statusId);
        } else {
          next.add(statusId);
        }
        saveCollapsedGroups(windowLabel, [...next]);
        return next;
      });
    },
    [windowLabel],
  );
  ```

- [ ] **Step 3: Add auto-expand effect in App.tsx**

  After the `handleToggleGroup` block, add an effect that watches `activeWorkspaceId` and auto-expands the group when needed. The `workspaces` array items each have a `statusId?: string` field.

  ```typescript
  useEffect(() => {
    if (!activeWorkspaceId) return;
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws?.statusId) return;
    if (collapsedGroups.has(ws.statusId)) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        next.delete(ws.statusId!);
        saveCollapsedGroups(windowLabel, [...next]);
        return next;
      });
    }
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  ```

  Note: The dependency array intentionally omits `workspaces`, `collapsedGroups`, `windowLabel` to avoid running on every workspace list change. The effect only needs to fire when the active workspace changes.

- [ ] **Step 4: Update `cycleWorkspace` to skip collapsed groups**

  Find `cycleWorkspace` (around line 1991-1999):

  ```typescript
  const cycleWorkspace = useCallback(
    (delta: 1 | -1) => {
      if (workspaces.length < 2) return;
      const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
      const nextIdx = (idx + delta + workspaces.length) % workspaces.length;
      setActiveWorkspaceId(workspaces[nextIdx].id);
    },
    [workspaces, activeWorkspaceId, setActiveWorkspaceId],
  );
  ```

  Replace with:

  ```typescript
  const cycleWorkspace = useCallback(
    (delta: 1 | -1) => {
      const navigable = workspaces.filter(
        (w) => !w.statusId || !collapsedGroups.has(w.statusId),
      );
      if (navigable.length < 2) return;
      const idx = navigable.findIndex((w) => w.id === activeWorkspaceId);
      const baseIdx = idx === -1 ? 0 : idx;
      const nextIdx = (baseIdx + delta + navigable.length) % navigable.length;
      setActiveWorkspaceId(navigable[nextIdx].id);
    },
    [workspaces, collapsedGroups, activeWorkspaceId, setActiveWorkspaceId],
  );
  ```

- [ ] **Step 5: Pass new props to WorkspaceSidebar in App.tsx**

  Find the `<WorkspaceSidebar` JSX block (around line 2596-2617):

  ```tsx
  <WorkspaceSidebar
    workspaces={...}
    activeId={activeWorkspaceId}
    onSelect={setActiveWorkspaceId}
    ...
    workspaceStatuses={workspaceStatuses}
    onSetStatus={setWorkspaceStatus}
  />
  ```

  Add the two new props:

  ```tsx
  <WorkspaceSidebar
    workspaces={workspaces.map((w) => ({
      id: w.id,
      title: w.title,
      kind: "terminal",
      cwd: w.cwd,
      color: w.color,
      icon: w.icon,
      statusId: w.statusId,
    }))}
    activeId={activeWorkspaceId}
    onSelect={setActiveWorkspaceId}
    onNew={() => addWorkspace(home ?? undefined)}
    onReorder={reorderWorkspaces}
    onClose={(wsId) => void requestCloseWorkspace(wsId)}
    onRename={(id, title) => setWorkspaceTitle(id, title)}
    onOpenSettings={(id) => useWorkspaceSettingsStore.getState().openSettings(id)}
    width={workspaceSidebarWidth}
    onWidthChange={handleSidebarWidthChange}
    workspaceStatuses={workspaceStatuses}
    onSetStatus={setWorkspaceStatus}
    collapsedGroups={collapsedGroups}
    onToggleGroup={handleToggleGroup}
  />
  ```

- [ ] **Step 6: Type-check**

  ```bash
  pnpm check-types 2>&1 | head -30
  ```

  Expected: TypeScript errors about `WorkspaceSidebarProps` missing `collapsedGroups` and `onToggleGroup` — these will be fixed in Task 4. All other lines should be clean.

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/App.tsx
  git commit -m "feat(app): add collapsed group state, toggle handler, auto-expand, and cycleWorkspace filter"
  ```

---

### Task 4: WorkspaceSidebar — chevron, count, compact toggle, item filtering

**Files:**
- Modify: `src/app/components/WorkspaceSidebar.tsx`

**Interfaces:**
- Consumes: `collapsedGroups: Set<string>` and `onToggleGroup: (statusId: string) => void` as new props on `WorkspaceSidebarProps`
- Consumes: `ChevronRight01Icon` from `@hugeicons/core-free-icons`

- [ ] **Step 1: Add new props to `WorkspaceSidebarProps`**

  Find the `WorkspaceSidebarProps` type (around line 49-62):

  ```typescript
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

  Add the two new props:

  ```typescript
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
    collapsedGroups: Set<string>;
    onToggleGroup: (statusId: string) => void;
  };
  ```

- [ ] **Step 2: Add `ChevronRight01Icon` import**

  Find the icon import at the top of the file (around line 18):

  ```typescript
  import { Cancel01Icon, Delete02Icon, PencilEdit01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
  ```

  Add `ChevronRight01Icon` to it:

  ```typescript
  import { Cancel01Icon, ChevronRight01Icon, Delete02Icon, PencilEdit01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
  ```

- [ ] **Step 3: Destructure new props in `WorkspaceSidebar`**

  Find the function signature (around line 261-274):

  ```typescript
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
  ```

  Add the two new props:

  ```typescript
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
    collapsedGroups,
    onToggleGroup,
  }: WorkspaceSidebarProps) {
  ```

- [ ] **Step 4: Update group rendering in the JSX**

  Find the groups render block inside the `DndContext` (around line 343-370):

  ```tsx
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
  ```

  Replace with:

  ```tsx
  {groups.map((group) => {
    const isCollapsible = group.label !== null;
    const isCollapsed = isCollapsible && collapsedGroups.has(group.id);
    return (
      <div key={group.id} className="w-full">
        {isCollapsible && (
          compact ? (
            <button
              type="button"
              title={isCollapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
              onClick={() => onToggleGroup(group.id)}
              className={cn(
                "mx-1.5 my-1 h-px w-[calc(100%-12px)] rounded-full border-0 bg-border/40 transition-colors hover:bg-border/80",
                isCollapsed && "bg-border/70",
              )}
            />
          ) : (
            <button
              type="button"
              onClick={() => onToggleGroup(group.id)}
              className="flex w-full items-center gap-1 px-1.5 pt-2 pb-0.5 text-left transition-colors hover:text-foreground/80"
            >
              <HugeiconsIcon
                icon={ChevronRight01Icon}
                size={10}
                strokeWidth={2}
                className={cn(
                  "shrink-0 text-muted-foreground/60 transition-transform duration-150",
                  !isCollapsed && "rotate-90",
                )}
              />
              <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                {group.label}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">
                {group.items.length}
              </span>
            </button>
          )
        )}
        {!isCollapsed && (
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
        )}
      </div>
    );
  })}
  ```

- [ ] **Step 5: Lint, type-check, test**

  ```bash
  pnpm exec biome lint ./src 2>&1 | head -30
  pnpm check-types 2>&1 | head -30
  pnpm test 2>&1 | tail -20
  ```

  Expected: no errors in any command.

- [ ] **Step 6: Cargo clippy and tests**

  ```bash
  cd src-tauri && cargo clippy 2>&1 | head -20 && cargo test --locked 2>&1 | tail -20
  ```

  Expected: no new errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/components/WorkspaceSidebar.tsx
  git commit -m "feat(sidebar): collapsible status groups with chevron, count, and compact toggle"
  ```

---

## Self-Review

**Spec coverage:**
- [x] Chevron icon rotates on group header — Task 4 Step 4 (`rotate-90` class when not collapsed)
- [x] Clicking header toggles collapse — Task 4 Step 4 (`onClick={() => onToggleGroup(group.id)}`)
- [x] Compact mode: horizontal divider is a clickable button — Task 4 Step 4
- [x] Collapsed groups hide their workspaces — Task 4 Step 4 (`!isCollapsed && <SortableContext>`)
- [x] Auto-expand on active workspace change — Task 3 Step 3 (useEffect on activeWorkspaceId)
- [x] `cycleWorkspace` skips collapsed groups — Task 3 Step 4
- [x] Count shown after label — Task 4 Step 4 (`{group.items.length}`)
- [x] Count not shown in compact mode — compact mode renders no label, just the line button
- [x] Persisted per window — Tasks 1 and 2 wire the full save/load path
- [x] `__none__` group is never collapsible — `isCollapsible = group.label !== null`; `__none__` always has `label: null`

**Placeholder scan:** No TBDs, no "implement later", no vague steps — all steps have complete code.

**Type consistency:**
- `collapsedGroups: Set<string>` — consistent across App.tsx (state), WorkspaceSidebarProps (prop), and the filter in cycleWorkspace.
- `onToggleGroup: (statusId: string) => void` — matches `handleToggleGroup` in App.tsx.
- `saveCollapsedGroups(label: string, ids: string[]): void` — used as `saveCollapsedGroups(windowLabel, [...next])` everywhere.
- `window_save_collapsed_groups` — command name matches in Rust `lib.rs` and frontend `invoke` call.
- `collapsed_status_groups` — Rust field name; serde `camelCase` serializes it as `collapsedStatusGroups`, which matches the TypeScript `WindowEntry` type field.
