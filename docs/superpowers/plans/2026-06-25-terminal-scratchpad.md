# Terminal Scratchpad Bar -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable textarea bar at the bottom of every terminal pane that lets the user compose and edit multi-line input before sending it to the PTY.

**Architecture:** Extends the existing session module (`useTerminalSession.ts`) with per-leaf scratchpad state, following the same listener pattern as `blockMode`. A new `ScratchpadBar` component renders inside `TerminalPane` below the xterm surface. A new global shortcut `terminal.scratchpad` opens/cycles the bar. The Enter-key behavior is a persistent preference stored in `settings-general.json`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, shadcn/ui Switch, `submitToLeaf` (existing), `usePreferencesStore` (Zustand), `useGlobalShortcuts`.

**Worktree:** `/Users/avilches/Work/Proy/Repos/terax-ai/.claude/worktrees/terminal-scratchpad`
All commands must be run from that directory.

## Global Constraints

- No em-dash anywhere (code, comments, commits).
- No emojis anywhere.
- No `Co-authored-by` in commit messages.
- Imports always `@/...` on the frontend, never relative across modules.
- `pnpm only` -- never npm/npx/yarn.
- Quality checks before each commit: `pnpm lint && pnpm check-types && pnpm test --run`.
- Lint via Biome: `pnpm exec biome lint ./src` (not `pnpm lint` -- RTK proxy breaks it).
- All keyboard shortcuts must live in `src/modules/shortcuts/shortcuts.ts`.

---

### Task 1: Add `scratchpadEnterSends` preference

**Files:**
- Modify: `src/modules/settings/store.ts`
- Modify: `src/settings/sections/TerminalSection.tsx`
- Test: `src/modules/settings/store.test.ts`

**Interfaces:**
- Produces:
  - `Preferences.scratchpadEnterSends: boolean` (default `true`)
  - `setTerminalScratchpadEnterSends(value: boolean): Promise<void>` exported from `store.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/modules/settings/store.test.ts`:

```typescript
describe("DEFAULT_PREFERENCES", () => {
  it("scratchpadEnterSends defaults to true", () => {
    expect(DEFAULT_PREFERENCES.scratchpadEnterSends).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --run src/modules/settings/store.test.ts
```

Expected: FAIL -- `scratchpadEnterSends` does not exist on `DEFAULT_PREFERENCES`.

- [ ] **Step 3: Add the preference field to store.ts**

In `src/modules/settings/store.ts`, add the field to `Preferences` (after `keepFolderLayoutOnChangeExplorerRoot`, line ~170):

```typescript
  scratchpadEnterSends: boolean;
```

Add the storage key constant (after `KEY_KEEP_FOLDER_LAYOUT`, line ~226):

```typescript
const KEY_SCRATCHPAD_ENTER_SENDS = "scratchpadEnterSends";
```

Add the default (after `keepFolderLayoutOnChangeExplorerRoot: false,`, line ~366):

```typescript
  scratchpadEnterSends: true,
```

Add loading in `loadPreferences()` (after the `keepFolderLayoutOnChangeExplorerRoot` line, around line ~599):

```typescript
    scratchpadEnterSends:
      get<boolean>(KEY_SCRATCHPAD_ENTER_SENDS) ??
      DEFAULT_PREFERENCES.scratchpadEnterSends,
```

Add the setter (after `setLastWslDistro`, anywhere near the other boolean setters):

```typescript
export async function setTerminalScratchpadEnterSends(value: boolean): Promise<void> {
  await writePref(KEY_SCRATCHPAD_ENTER_SENDS, value);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test --run src/modules/settings/store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add the toggle to TerminalSection.tsx**

In `src/settings/sections/TerminalSection.tsx`:

Add the import in the existing `store` import block:
```typescript
  setTerminalScratchpadEnterSends,
```

Add the preference read (after `const warnOnCloseRunning = ...` line):
```typescript
  const scratchpadEnterSends = usePreferencesStore((s) => s.scratchpadEnterSends);
```

Add the UI row. Place it at the end of the first `<div className="flex flex-col gap-2">` group (after the "Warn when closing..." row, before the closing `</div>`):
```tsx
        <SettingRow
          title="Scratchpad: Enter sends"
          description="When the scratchpad bar is open, Enter sends the text to the terminal. Shift+Enter inserts a newline. Uncheck to swap."
        >
          <Switch
            checked={scratchpadEnterSends}
            onCheckedChange={(v) => void setTerminalScratchpadEnterSends(v)}
          />
        </SettingRow>
```

- [ ] **Step 6: Run quality checks and commit**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test --run
git add src/modules/settings/store.ts src/modules/settings/store.test.ts src/settings/sections/TerminalSection.tsx
git commit -m "feat(settings): add scratchpadEnterSends preference"
```

---

### Task 2: Add `terminal.scratchpad` shortcut

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Test: `src/modules/shortcuts/shortcuts.test.ts`

**Interfaces:**
- Consumes: `IS_MAC` (already imported in `shortcuts.ts`)
- Produces: `"terminal.scratchpad"` in `ShortcutId` union; entry in `SHORTCUTS` array

- [ ] **Step 1: Write the failing test**

Add to `src/modules/shortcuts/shortcuts.test.ts`:

```typescript
describe("terminal.scratchpad shortcut", () => {
  it("is registered in SHORTCUTS", () => {
    const sc = SHORTCUTS.find((s) => s.id === "terminal.scratchpad");
    expect(sc).toBeDefined();
    expect(sc?.group).toBe("Terminal");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --run src/modules/shortcuts/shortcuts.test.ts
```

Expected: FAIL -- `terminal.scratchpad` is not in `SHORTCUTS`.

- [ ] **Step 3: Add the shortcut**

In `src/modules/shortcuts/shortcuts.ts`:

Add `"terminal.scratchpad"` to the `ShortcutId` union (after `"terminal.clear"`, around line 34):
```typescript
  | "terminal.scratchpad"
```

Add the entry to `SHORTCUTS` (after the `terminal.clear` entry, around line 349):
```typescript
  {
    id: "terminal.scratchpad",
    label: "Toggle Scratchpad Bar",
    group: "Terminal",
    defaultBindings: IS_MAC ? [{ meta: true, key: "u" }] : [],
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test --run src/modules/shortcuts/shortcuts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run quality checks and commit**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test --run
git add src/modules/shortcuts/shortcuts.ts src/modules/shortcuts/shortcuts.test.ts
git commit -m "feat(shortcuts): add terminal.scratchpad shortcut (Cmd+U on macOS)"
```

---

### Task 3: Extend session module with scratchpad state

**Files:**
- Modify: `src/modules/terminal/lib/useTerminalSession.ts`

**Interfaces:**
- Consumes: `focusSlot(leafId)` (already in the module)
- Produces (exported functions):
  - `cycleScratchpad(leafId: string): void`
  - `closeScratchpad(leafId: string): void`
  - `setLeafScratchpadFocus(leafId: string, fn: (() => void) | null): void`
  - `setLeafScratchpadFocused(leafId: string, focused: boolean): void`
  - `getLeafScratchpadDraft(leafId: string): string`
  - `setLeafScratchpadDraft(leafId: string, text: string): void`
- `useTerminalSession` hook now returns `scratchpadOpen: boolean`

- [ ] **Step 1: Add scratchpad fields to the `Session` type**

In `src/modules/terminal/lib/useTerminalSession.ts`, add to the `Session` type (after the `altScreenAtRelease` field, around line 104):

```typescript
  scratchpadOpen: boolean;
  scratchpadFocused: boolean;
  scratchpadFocus: (() => void) | null;
  scratchpadDraft: string;
  scratchpadListeners: Set<() => void>;
```

- [ ] **Step 2: Initialize the new fields in `ensureSession`**

In `ensureSession` (around line 383), add to the `session` object (after `altScreenAtRelease: false,`):

```typescript
    scratchpadOpen: false,
    scratchpadFocused: false,
    scratchpadFocus: null,
    scratchpadDraft: "",
    scratchpadListeners: new Set(),
```

- [ ] **Step 3: Add the exported module-level functions**

Add after the existing `focusLeafInput` / `getLeafDraft` / `setLeafDraft` block (around line 239):

```typescript
function notifyScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  for (const l of s.scratchpadListeners) l();
}

export function cycleScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s || s.shellExited) return;
  if (!s.scratchpadOpen) {
    s.scratchpadOpen = true;
    notifyScratchpad(leafId);
    // Focus callback registered after the component mounts; try next tick.
    setTimeout(() => s.scratchpadFocus?.(), 0);
  } else if (s.scratchpadFocused) {
    focusSlot(leafId);
  } else {
    s.scratchpadFocus?.();
  }
}

export function closeScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  if (!s.scratchpadOpen) return;
  s.scratchpadOpen = false;
  notifyScratchpad(leafId);
  focusSlot(leafId);
}

export function setLeafScratchpadFocus(
  leafId: string,
  fn: (() => void) | null,
): void {
  const s = sessions.get(leafId);
  if (s) s.scratchpadFocus = fn;
}

export function setLeafScratchpadFocused(
  leafId: string,
  focused: boolean,
): void {
  const s = sessions.get(leafId);
  if (s) s.scratchpadFocused = focused;
}

export function getLeafScratchpadDraft(leafId: string): string {
  return sessions.get(leafId)?.scratchpadDraft ?? "";
}

export function setLeafScratchpadDraft(leafId: string, text: string): void {
  const s = sessions.get(leafId);
  if (s) s.scratchpadDraft = text;
}
```

- [ ] **Step 4: Expose `scratchpadOpen` from `useTerminalSession`**

In `useTerminalSession`, add a `scratchpadOpen` state (after the `blockMode` state block, around line 811):

```typescript
  const [scratchpadOpen, setScratchpadOpen] = useState<boolean>(
    () => sessions.get(leafId)?.scratchpadOpen ?? false,
  );
  useEffect(() => {
    const s = ensureSession(leafId, initialCwdRef.current, blocks);
    setScratchpadOpen(s.scratchpadOpen);
    const cb = () => setScratchpadOpen(sessions.get(leafId)?.scratchpadOpen ?? false);
    s.scratchpadListeners.add(cb);
    return () => {
      s.scratchpadListeners.delete(cb);
    };
  }, [leafId, blocks]);
```

Add `scratchpadOpen` to the hook's `useMemo` return value (after `clearSearch,` around line 1009):

```typescript
      scratchpadOpen,
```

And to the dependency array of `useMemo` (after `clearSearch,`):

```typescript
      scratchpadOpen,
```

- [ ] **Step 5: Run quality checks and commit**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test --run
git add src/modules/terminal/lib/useTerminalSession.ts
git commit -m "feat(terminal): add per-leaf scratchpad state to session module"
```

---

### Task 4: Create ScratchpadBar component

**Files:**
- Create: `src/modules/terminal/ScratchpadBar.tsx`

**Interfaces:**
- Consumes:
  - `submitToLeaf(leafId, text)` from `./lib/useTerminalSession`
  - `closeScratchpad(leafId)` from `./lib/useTerminalSession`
  - `setLeafScratchpadFocus(leafId, fn)` from `./lib/useTerminalSession`
  - `setLeafScratchpadFocused(leafId, focused)` from `./lib/useTerminalSession`
  - `getLeafScratchpadDraft(leafId)` from `./lib/useTerminalSession`
  - `setLeafScratchpadDraft(leafId, text)` from `./lib/useTerminalSession`
  - `usePreferencesStore` from `@/modules/settings/preferences`
  - `setTerminalScratchpadEnterSends` from `@/modules/settings/store`
  - `Switch` from `@/components/ui/switch`
- Produces: `<ScratchpadBar leafId={string} />` component

- [ ] **Step 1: Create the component**

Create `src/modules/terminal/ScratchpadBar.tsx`:

```tsx
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTerminalScratchpadEnterSends } from "@/modules/settings/store";
import { useEffect, useRef, useState } from "react";
import {
  closeScratchpad,
  getLeafScratchpadDraft,
  setLeafScratchpadDraft,
  setLeafScratchpadFocus,
  setLeafScratchpadFocused,
  submitToLeaf,
} from "./lib/useTerminalSession";

const MAX_TEXTAREA_HEIGHT = 160; // px, ~6 lines

type Props = {
  leafId: string;
};

export function ScratchpadBar({ leafId }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(() => getLeafScratchpadDraft(leafId));
  const enterSends = usePreferencesStore((s) => s.scratchpadEnterSends);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    setLeafScratchpadFocus(leafId, () => el.focus());
    return () => setLeafScratchpadFocus(leafId, null);
  }, [leafId]);

  function send() {
    if (!text.trim()) return;
    submitToLeaf(leafId, text);
    setText("");
    setLeafScratchpadDraft(leafId, "");
    textareaRef.current?.focus();
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    setLeafScratchpadDraft(leafId, val);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeScratchpad(leafId);
      return;
    }
    const isEnter = e.key === "Enter";
    if (!isEnter) return;
    const shouldSend = enterSends ? !e.shiftKey : e.shiftKey;
    if (shouldSend) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-border/40 px-3 py-2">
      <textarea
        ref={textareaRef}
        value={text}
        rows={1}
        placeholder="Scratchpad -- type here, send to terminal"
        className="min-h-[28px] w-0 flex-1 resize-none overflow-hidden rounded bg-transparent font-mono text-sm leading-[1.4] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setLeafScratchpadFocused(leafId, true)}
        onBlur={() => setLeafScratchpadFocused(leafId, false)}
      />
      <div className="flex shrink-0 items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 select-none">
          <Switch
            checked={enterSends}
            onCheckedChange={(v) => void setTerminalScratchpadEnterSends(v)}
          />
          <span className="text-[11px] text-muted-foreground">
            {enterSends ? "Enter=Send" : "Shift+Enter=Send"}
          </span>
        </label>
        <button
          type="button"
          onClick={send}
          className="flex h-[22px] items-center justify-center rounded px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run quality checks and commit**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test --run
git add src/modules/terminal/ScratchpadBar.tsx
git commit -m "feat(terminal): add ScratchpadBar component"
```

---

### Task 5: Render ScratchpadBar in TerminalPane

**Files:**
- Modify: `src/modules/terminal/TerminalPane.tsx`

**Interfaces:**
- Consumes: `ScratchpadBar` from `./ScratchpadBar`, `session.scratchpadOpen: boolean`
- The regular terminal branch (non-blocks) changes from a single `<div>` to a flex-column wrapper.

- [ ] **Step 1: Add the ScratchpadBar import**

In `src/modules/terminal/TerminalPane.tsx`, add the import after the existing local imports:

```typescript
import { ScratchpadBar } from "./ScratchpadBar";
```

- [ ] **Step 2: Update the `useImperativeHandle` to include `scratchpadOpen`**

This step is informational only -- `scratchpadOpen` does NOT need to be on the handle since it is consumed internally. No handle change needed.

- [ ] **Step 3: Update the blocks branch to include ScratchpadBar**

In `src/modules/terminal/TerminalPane.tsx`, the blocks branch currently ends with:
```tsx
          <div className="shrink-0 border-t border-border/40 px-3 py-2">
            <Suspense fallback={null}>
              <ShellInput ... />
            </Suspense>
          </div>
        </div>
```

Add `<ScratchpadBar>` after the `ShellInput` div:
```tsx
          <div className="shrink-0 border-t border-border/40 px-3 py-2">
            <Suspense fallback={null}>
              <ShellInput ... />
            </Suspense>
          </div>
          {session.scratchpadOpen && <ScratchpadBar leafId={panelId} />}
        </div>
```

- [ ] **Step 4: Update the regular terminal branch**

The regular terminal branch currently renders:
```tsx
    return (
      <div ref={containerRef} className="zoom-exempt h-full w-full" style={hideStyle} />
    );
```

Replace with a flex-column wrapper that includes ScratchpadBar:
```tsx
    return (
      <div className="zoom-exempt flex h-full w-full flex-col" style={hideStyle}>
        <div ref={containerRef} className="min-h-0 flex-1" />
        {session.scratchpadOpen && <ScratchpadBar leafId={panelId} />}
      </div>
    );
```

- [ ] **Step 5: Run quality checks and commit**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test --run
git add src/modules/terminal/TerminalPane.tsx
git commit -m "feat(terminal): render ScratchpadBar in TerminalPane"
```

---

### Task 6: Wire the shortcut in App.tsx

**Files:**
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes:
  - `cycleScratchpad` from `@/modules/terminal` (add to the existing import from `useTerminalSession.ts`)
  - `"terminal.scratchpad"` ShortcutId (already valid after Task 2)

- [ ] **Step 1: Add `cycleScratchpad` to the import**

In `src/app/App.tsx`, find the import line that includes `writeToSession` (around line 66). It currently imports several functions from the terminal module. Add `cycleScratchpad` to that same import:

```typescript
import {
  clearFocusedTerminal,
  cycleScratchpad,
  navigateFocusedBlocks,
  submitToLeaf,
  writeToSession,
  // ... other existing imports
} from "@/modules/terminal";
```

- [ ] **Step 2: Add the shortcut handler to `shortcutHandlers`**

In the `useMemo` that builds `shortcutHandlers` (around line 1850), add the new handler after `"terminal.clear"`:

```typescript
      "terminal.scratchpad": () => {
        if (activePanelId && activePanel?.kind === "terminal") {
          cycleScratchpad(activePanelId);
        }
      },
```

- [ ] **Step 3: Add `cycleScratchpad` to the `useMemo` dependency array**

The `useMemo` dependency array includes all referenced functions. `cycleScratchpad` is a stable module-level function (not recreated), so it does NOT need to be in the deps. The handler only closes over `activePanelId` and `activePanel`, which are already in the deps array.

No change needed to the dependency array.

- [ ] **Step 4: Run quality checks and commit**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test --run
git add src/app/App.tsx
git commit -m "feat(app): wire terminal.scratchpad shortcut handler"
```

---

## Self-Review

**Spec coverage checklist:**

| Spec requirement | Task |
|-----------------|------|
| Cmd+U opens bar on macOS | Task 2 (shortcut) + Task 6 (handler) |
| Cmd+U cycles focus bar<->terminal | Task 3 (`cycleScratchpad`) |
| Escape closes bar + focuses terminal | Task 4 (`handleKeyDown`) |
| Per-terminal open/closed state | Task 3 (`scratchpadOpen` in Session) |
| Draft persists between close/open | Task 3 (`scratchpadDraft`) + Task 4 (init from `getLeafScratchpadDraft`) |
| Sends via `submitToLeaf` (handles multiline) | Task 4 (`send()`) |
| Enter=Send toggle, default true | Task 1 (preference) + Task 4 (component) |
| Label changes to "Shift+Enter=Send" | Task 4 (conditional label) |
| Persists in settings | Task 1 |
| Toggle visible in Settings Terminal section | Task 1 (TerminalSection) |
| Works for both blocks and regular terminals | Task 5 (both branches) |
| Auto-growing textarea | Task 4 (`handleChange` resize logic) |
| Send button | Task 4 |

**Placeholder scan:** None found.

**Type consistency:**
- `cycleScratchpad(leafId: string)` used in Task 6, defined in Task 3. Match.
- `closeScratchpad(leafId: string)` used in Task 4, defined in Task 3. Match.
- `setLeafScratchpadFocus`, `setLeafScratchpadFocused`, `getLeafScratchpadDraft`, `setLeafScratchpadDraft` all defined in Task 3, used in Task 4. Match.
- `session.scratchpadOpen: boolean` produced by Task 3, consumed in Task 5. Match.
- `setTerminalScratchpadEnterSends` produced by Task 1, consumed in Task 4. Match.
- `Preferences.scratchpadEnterSends` produced by Task 1, consumed as `usePreferencesStore((s) => s.scratchpadEnterSends)` in Task 4. Match.
