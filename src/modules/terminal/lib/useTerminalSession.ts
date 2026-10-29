import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  consumeRestorePlan,
  detachAgentSession,
  previewResumeCmd,
  restorePlansReady,
  seedRestorePlan,
  stageRestoredSnapshot,
  watchResume,
} from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { ensureMonoFontsLoaded } from "@/lib/fonts";
import { applyZoomToDom } from "@/lib/useZoom";
import { applyZoomThenRefit } from "@/lib/zoomSync";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DormantRing } from "./dormantRing";
import { estimateParkedTerminalBudget } from "./backgroundMemoryBudget";
import {
  drop as dropParkedLeaf,
  evictOverflow,
  shouldEvictParkedLeaf,
  touch as touchParkedLeaf,
} from "./parkedLeafOrder";
import { shouldFireOnRegister } from "./pendingFocus";
import type { BlockMode } from "../block/lib/modeMachine";
import {
  createShellIntegrationState,
  registerCwdHandler,
  registerOsc52ClipboardHandler,
  registerPromptTracker,
  registerTitleHandler,
} from "./osc-handlers";
import { clearOscTitle, setOscTitle } from "./oscTitleStore";
import { isRunningAgentSession } from "@/modules/agents/lib/sessionEndPolicy";
import { consumeHeldBlock, setModalBlock, getPendingRestore, pendingRestoreLeafIds, setPendingRestore } from "./pendingRestore";
import { takeWakeBackdrop } from "./wakeBackdrop";
import { openPty, type PtySession } from "./pty-bridge";
import { spawnCwdUpdate } from "./spawnCwd";
import { markShellReady, waitForShellReady } from "./shellReadyWaiter";
import { withRestoreBusy } from "./restoreBusy";
import {
  decideStart,
  needsDirCheck,
  openFailureBlock,
  discardPendingFlow,
  retryRestoreFlow,
  type RestoreActionDeps,
  type RestoreBlock,
} from "./restoreStart";
import {
  type BlockMatch,
  BlockDecorations,
  type VisibleBlocks,
} from "../block/lib/blockDecorations";
import "../block/block.css";
import {
  acquireSlot,
  applyCursorBlink,
  applyCursorInactiveStyle,
  applyCursorStyle,
  applyCursorWidth,
  applyFontFamily,
  applyFontSize,
  applyFontWeight,
  applyLetterSpacing,
  applyLineHeight,
  applyTheme as applyPoolTheme,
  applyScrollback,
  applyScrollSensitivity,
  applyWebglPreference,
  renderFontSize,
  configureRendererPool,
  disposeLeafSlot,
  focusSlot,
  getSlotForLeaf,
  isLeafAltScreen,
  parkLeafSlot,
  poolSize,
  poolSlotStats,
  refreshLeafSlot,
  releaseSlot,
  setSlotFocused,
} from "./rendererPool";

type Callbacks = {
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onRunningCommand?: (cmd: string | null, started?: boolean) => void;
  onScratchpadEnabled?: (enabled: boolean) => void;
};

type Session = {
  pty: PtySession | null;
  ptyOpening: boolean;
  ptyGen: number;
  initialCwd: string | undefined;
  // Restore Command, captured at startup. On the first PTY spawn the session decides what to
  // inject: the agent resume (if it had an agent) or this command (otherwise).
  persistentCommand: string | undefined;
  // Set while the start is held back (unusable directory, PTY refused to open): no PTY exists
  // and the tab shows a modal until the user retries or cancels.
  restoreBlock: RestoreBlock | null;
  lastCwd: string | null;
  pendingExit: number | null;
  shellExited: boolean;
  callbacks: Callbacks;
  visibleNow: boolean;
  focusedNow: boolean;
  disposed: boolean;
  ready: Promise<void>;
  cols: number;
  rows: number;
  container: HTMLDivElement | null;
  snapshot: string | null;
  searchQuery: string | null;
  dormantRing: DormantRing;
  pendingInput: string;
  hasSlot: boolean;
  blocks: boolean;
  blockMode: BlockMode;
  blockListeners: Set<() => void>;
  blockDecorations: BlockDecorations | null;
  // True once the shell emitted any OSC 133 marker, so prompt state is real.
  integrationSeen: boolean;
  // Set by the block shell-input; called to pull focus back when the xterm
  // grid steals it at the prompt (e.g. on a click), so typing stays in the bar.
  inputFocus: (() => void) | null;
  // Per-leaf unsent shell-input text; the single workspace bar swaps it on focus change.
  inputDraft: string;
  // Live "input has text" flag from the block shell-input (gates the watermark).
  inputActive: boolean;
  // A command was submitted on this leaf; kills the watermark synchronously,
  // before the shell's OSC 133 C round-trips through the PTY.
  everSubmitted: boolean;
  // True if the slot was in alt-screen mode (TUI like vim, htop, dofek)
  // at the most recent release. Read once on the next bind to trigger a
  // SIGWINCH-driven repaint instead of replaying dormant bytes.
  altScreenAtRelease: boolean;
  // Live: does the scratchpad exist right now. Existence and focus are the
  // same thing here -- there is no "open but unfocused" state. Anything that
  // takes real focus away from the scratchpad (clicking the terminal,
  // switching tabs or workspaces, Escape, Cmd+U) closes it; visibility is
  // derived directly from this flag (scratchpadOpen && the tab is focused).
  scratchpadOpen: boolean;
  scratchpadFocus: (() => void) | null;
  // A focus request arrived before ScratchpadBar mounted and registered
  // scratchpadFocus (restore, or a just-created terminal). Consumed as soon
  // as the callback registers, instead of guessing how many ticks to wait.
  scratchpadFocusPending: boolean;
  scratchpadInsert: ((text: string) => void) | null;
  scratchpadDraft: string;
};

const sessions = new Map<string, Session>();

// Fallback only for shells without Kex's OSC 133 integration (custom shell
// override): the real signal is the first interactive prompt.
const SHELL_READY_FALLBACK_MS = 1500;

listen<{ id: number }>("kex:shell-ready", (e) => markShellReady(e.payload.id)).catch(
  (err) => console.warn("[kex] shell-ready listener failed:", err),
);

async function writeWhenShellReady(
  s: Session,
  leafId: string,
  pty: PtySession,
  data: string,
): Promise<void> {
  const t0 = performance.now();
  await waitForShellReady(pty.id, SHELL_READY_FALLBACK_MS);
  const waited = Math.round(performance.now() - t0);
  if (s.disposed || s.pty !== pty) return;
  console.debug(`[kex] restore-command write tab=${leafId} pty=${pty.id} waited=${waited}ms`);
  void pty.write(data);
}

// Recency-ordered leaves kept "parked" (hidden, but their terminal and
// buffer stay alive) instead of being released and rebuilt from a
// serialized snapshot on their next visit. Bounded by
// terminalBackgroundMemoryBudgetMB; see backgroundMemoryBudget.ts.
const parkedLeaves: string[] = [];

function parkedLeafBudget(): number {
  const prefs = usePreferencesStore.getState();
  return estimateParkedTerminalBudget(
    prefs.terminalBackgroundMemoryBudgetMB * 1024 * 1024,
    prefs.terminalScrollback,
  );
}

// Called when a non-blocks, non-alt-screen leaf goes invisible. Keeps its
// terminal and buffer alive (dropping only the GPU context, same as
// parkLeafSlot does today for blocks/alt-screen leaves) and defers the
// budget sweep; see scheduleParkedLeafSweep for why it can't decide
// synchronously which leaf (if any) to fully release.
function parkOrReleaseLeaf(leafId: string): void {
  parkLeafSlot(leafId);
  touchParkedLeaf(parkedLeaves, leafId);
  scheduleParkedLeafSweep();
}

function enforceParkedLeafBudget(): void {
  const evicted = evictOverflow(parkedLeaves, parkedLeafBudget());
  for (const id of evicted) {
    const es = sessions.get(id);
    if (!es || !shouldEvictParkedLeaf(es, isLeafAltScreen(id))) continue;
    unbindLeafFromSlot(id, es);
  }
}

let parkedLeafSweepScheduled = false;

// A single render can flip `visible` for several leaves at once (e.g. a
// workspace switch hides one pane's tab and shows another's). React runs
// each leaf's own effect independently, in tree order, not by transition
// direction, so a hiding leaf's effect can run before a leaf that is
// becoming visible in that same commit has had a chance to remove itself
// from parkedLeaves via dropParkedLeaf. Evicting synchronously from the
// hiding side risks releasing the very leaf you just switched to. Deferring
// the sweep to a microtask runs it only after every effect in the current
// commit, including that leaf's own dropParkedLeaf, has already run.
// The guard flag collapses same-tick calls (one per mounted terminal tab)
// into a single sweep.
function scheduleParkedLeafSweep(): void {
  if (parkedLeafSweepScheduled) return;
  parkedLeafSweepScheduled = true;
  queueMicrotask(() => {
    parkedLeafSweepScheduled = false;
    enforceParkedLeafBudget();
  });
}

// Block-overlay viewport listeners, keyed by leafId at module scope so the
// overlay (a child) can subscribe before the parent effect creates the session.
const blockViewportListeners = new Map<string, Set<() => void>>();

// Scratchpad state listeners keyed by leafId at module scope, so subscribers
// (the tab tag, the pane) can subscribe before the session exists and still get
// notified once it is created and on every open/active/focused change.
const scratchpadListeners = new Map<string, Set<() => void>>();

const readyLeaves = new Set<string>();
const readyWaiters = new Map<
  string,
  { resolve: () => void; timer: ReturnType<typeof setTimeout> }[]
>();

function markSessionReady(leafId: string): void {
  if (readyLeaves.has(leafId)) return;
  readyLeaves.add(leafId);
  const waiters = readyWaiters.get(leafId);
  if (!waiters) return;
  readyWaiters.delete(leafId);
  for (const w of waiters) {
    clearTimeout(w.timer);
    w.resolve();
  }
}

export function whenSessionReady(leafId: string, timeoutMs = 4000): Promise<void> {
  if (readyLeaves.has(leafId)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const arr = readyWaiters.get(leafId);
      const i = arr?.findIndex((w) => w.timer === timer) ?? -1;
      if (arr && i >= 0) arr.splice(i, 1);
      resolve();
    }, timeoutMs);
    const arr = readyWaiters.get(leafId) ?? [];
    arr.push({ resolve, timer });
    readyWaiters.set(leafId, arr);
  });
}

// User-initiated input acknowledges the agent indicator: spinner and attention dot
// are cleared, but the session stays alive so the Claude icon remains until the agent exits.
function clearAgentSessionForLeaf(leafId: string): void {
  useAgentStore.getState().setStatus(leafId, "idle");
}

export const PENDING_INPUT_MAX = 256 * 1024;

// Input typed before the pty attaches is queued and flushed on attach. Cap the
// queue so a large paste into a still-spawning pane can't grow it without bound;
// an append that would overflow is dropped whole rather than truncated.
export function boundedPendingInput(
  current: string,
  data: string,
  max = PENDING_INPUT_MAX,
): string {
  if (current.length + data.length > max) return current;
  return current + data;
}

function queuePendingInput(s: Session, data: string): void {
  s.pendingInput = boundedPendingInput(s.pendingInput, data);
}

export function writeToSession(leafId: string, data: string): boolean {
  const s = sessions.get(leafId);
  if (!s || s.shellExited) return false;
  clearAgentSessionForLeaf(leafId);
  if (s.pty) {
    void s.pty.write(data);
    return true;
  }
  queuePendingInput(s, data);
  return true;
}

export function submitToLeaf(leafId: string, text: string): void {
  const s = sessions.get(leafId);
  if (!s || s.shellExited) return;
  s.everSubmitted = true;
  clearAgentSessionForLeaf(leafId);
  // Bracketed paste keeps a multiline command atomic; trailing CR runs it.
  const data = text.includes("\n")
    ? `\x1b[200~${text}\x1b[201~\r`
    : `${text}\r`;
  if (s.pty) void s.pty.write(data);
  else queuePendingInput(s, data);
}

export function interruptAgentLeaf(leafId: string): void {
  useAgentStore.getState().setStatus(leafId, "idle");
  const s = sessions.get(leafId);
  if (s?.pty) void s.pty.write("\x03");
}

export function interruptLeaf(leafId: string): void {
  clearAgentSessionForLeaf(leafId);
  sessions.get(leafId)?.pty?.write("\x03");
}

export function leafCwd(leafId: string): string | null {
  return sessions.get(leafId)?.lastCwd ?? null;
}

// The screen of the leaf with its colours, for the placeholder of a hibernating tab. `alt` says an
// app owns the alternate screen (the text then holds the normal buffer too, see `altScreenOf`).
// Null when there is no session or nothing was serialized.
export function leafAnsiTail(
  leafId: string,
  scrollback: number,
): { text: string; alt: boolean; rows: number } | null {
  const s = sessions.get(leafId);
  if (!s) return null;
  const slot = getSlotForLeaf(leafId);
  if (!slot) return s.snapshot ? { text: s.snapshot, alt: s.altScreenAtRelease, rows: s.rows } : null;
  try {
    return {
      text: slot.serializeAddon.serialize({ scrollback }),
      alt: slot.term.buffer.active.type === "alternate",
      rows: slot.term.rows,
    };
  } catch {
    return null;
  }
}

export function getLeafBlockMode(leafId: string): BlockMode {
  return sessions.get(leafId)?.blockMode ?? "prompt";
}

// Whether the leaf's shell is somewhere a command could be typed: the session is
// alive, its shell has integration (so prompt state is real) and no full-screen
// app owns the screen. Command state itself is tracked in the ephemeral store.
export function leafPromptReady(leafId: string): boolean {
  const s = sessions.get(leafId);
  if (!s || s.shellExited || !s.integrationSeen) return false;
  return !isLeafAltScreen(leafId);
}

export function subscribeLeafBlockMode(
  leafId: string,
  cb: () => void,
): () => void {
  const s = sessions.get(leafId);
  if (!s) return () => {};
  s.blockListeners.add(cb);
  return () => {
    s.blockListeners.delete(cb);
  };
}

export function setLeafInputFocus(
  leafId: string,
  fn: (() => void) | null,
): void {
  const s = sessions.get(leafId);
  if (s) s.inputFocus = fn;
}

export function focusLeafInput(leafId: string): void {
  sessions.get(leafId)?.inputFocus?.();
}

export function getLeafDraft(leafId: string): string {
  return sessions.get(leafId)?.inputDraft ?? "";
}

export function setLeafDraft(leafId: string, text: string): void {
  const s = sessions.get(leafId);
  if (s) s.inputDraft = text;
}

function notifyScratchpad(leafId: string): void {
  const set = scratchpadListeners.get(leafId);
  if (set) for (const l of set) l();
}

function subscribeLeafScratchpad(
  leafId: string,
  cb: () => void,
): () => void {
  let set = scratchpadListeners.get(leafId);
  if (!set) {
    set = new Set();
    scratchpadListeners.set(leafId, set);
  }
  set.add(cb);
  return () => {
    const live = scratchpadListeners.get(leafId);
    if (!live) return;
    live.delete(cb);
    if (live.size === 0) scratchpadListeners.delete(leafId);
  };
}

// Persist the enabled flag for restore.
function notifyScratchpadEnabled(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  s.callbacks.onScratchpadEnabled?.(s.scratchpadOpen);
}

// xterm.js can internally call .focus() on its own textarea asynchronously
// shortly after a layout change (its container resizing when the scratchpad
// bar mounts/unmounts changes the terminal's height). Deferring two animation
// frames -- the same margin scheduleUnhide uses to let the browser settle --
// and re-validating right before firing guarantees this is the last focus
// move and bails out if something else changed the target in the meantime.
function fireScratchpadFocus(s: Session): void {
  const fn = s.scratchpadFocus;
  if (!fn) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (s.scratchpadOpen && s.scratchpadFocus === fn) fn();
    });
  });
}

function requestScratchpadFocus(s: Session): void {
  if (s.scratchpadFocus) fireScratchpadFocus(s);
  else s.scratchpadFocusPending = true;
}

// State-only close: clears scratchpadOpen without touching where focus goes
// next. Used when focus is already headed elsewhere (the terminal just
// gained it, or a different tab/workspace is about to) so this never steals
// focus back.
function closeScratchpadState(s: Session, leafId: string): void {
  if (!s.scratchpadOpen) return;
  s.scratchpadOpen = false;
  s.scratchpadFocusPending = false;
  notifyScratchpad(leafId);
  notifyScratchpadEnabled(leafId);
}

function openScratchpadState(s: Session, leafId: string): void {
  s.scratchpadOpen = true;
  notifyScratchpad(leafId);
  notifyScratchpadEnabled(leafId);
  requestScratchpadFocus(s);
}

// Toggle: closed -> open+focus scratchpad. Open -> close (and focus the
// terminal, since open and focused are the same state here).
export function toggleScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s || s.shellExited) return;
  if (s.scratchpadOpen) {
    closeScratchpadState(s, leafId);
    focusSlot(leafId);
  } else {
    openScratchpadState(s, leafId);
  }
}

export function closeScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  closeScratchpadState(s, leafId);
  focusSlot(leafId);
}

// Closes this leaf's scratchpad without focusing its terminal. Called when
// this leaf is being left entirely (a different tab or workspace is about to
// take focus), so it never steals focus back from wherever it's headed.
export function leaveLeafScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  closeScratchpadState(s, leafId);
}

export function setLeafScratchpadFocus(
  leafId: string,
  fn: (() => void) | null,
): void {
  const s = sessions.get(leafId);
  if (!s) return;
  const fire = shouldFireOnRegister(fn, s.scratchpadFocusPending);
  s.scratchpadFocus = fn;
  if (fire) {
    s.scratchpadFocusPending = false;
    fireScratchpadFocus(s);
  }
}

// Called when the terminal grid gains real DOM focus (a leaf-scoped focusin
// on its container). A click on the terminal of the leaf that was ALREADY
// focused dismisses its scratchpad: the user deliberately went back to the
// terminal. A click on the terminal of a leaf that was NOT focused is a mouse
// pane/tab switch, not a dismiss -- at this point s.focusedNow is still
// false, because focusin fires during the mousedown's default action, before
// React commits the activePaneId/tab change that would flip it.
export function setLeafTerminalFocused(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  if (!s.focusedNow) return;
  closeScratchpadState(s, leafId);
}

export function setLeafScratchpadInsert(
  leafId: string,
  fn: ((text: string) => void) | null,
): void {
  const s = sessions.get(leafId);
  if (s) s.scratchpadInsert = fn;
}

export function insertIntoLeafScratchpad(leafId: string, text: string): void {
  sessions.get(leafId)?.scratchpadInsert?.(text);
}

export function getLeafScratchpadDraft(leafId: string): string {
  return sessions.get(leafId)?.scratchpadDraft ?? "";
}

export function setLeafScratchpadDraft(leafId: string, text: string): void {
  const s = sessions.get(leafId);
  if (s) s.scratchpadDraft = text;
}

/**
 * Clear the scrollback and screen of the currently focused terminal, keeping
 * the active prompt line - macOS Terminal's ⌘K behaviour. Returns false when no
 * focused terminal slot is bound (e.g. focus is in the editor or AI panel).
 */
export function clearFocusedTerminal(): boolean {
  for (const [leafId, s] of sessions) {
    if (!s.visibleNow || !s.focusedNow) continue;
    const slot = getSlotForLeaf(leafId);
    if (!slot) continue;
    slot.term.clear();
    return true;
  }
  return false;
}

/**
 * Move the block selection in the focused-and-visible block terminal. Steps to
 * the previous (-1) or next (+1) command block. No-op when focus is elsewhere
 * or the focused terminal has no block decorations.
 */
export function navigateFocusedBlocks(dir: -1 | 1): void {
  for (const [, s] of sessions) {
    if (!s.visibleNow || !s.focusedNow) continue;
    s.blockDecorations?.navigateBlocks(dir);
    return;
  }
}

export function clearLeafBlockSelection(leafId: string): boolean {
  return sessions.get(leafId)?.blockDecorations?.clearBlockSelection() ?? false;
}

// Grid text selection (the xterm buffer), null when nothing is selected. The
// block input owns focus at the prompt, so Cmd+C lands on the editor: it reads
// this to copy the grid selection when the editor has none of its own.
export function leafGridSelection(leafId: string): string | null {
  const sel = getSlotForLeaf(leafId)?.term.getSelection() ?? "";
  return sel.length > 0 ? sel : null;
}

export function setLeafInputActivity(leafId: string, active: boolean): void {
  const s = sessions.get(leafId);
  if (!s || s.inputActive === active) return;
  s.inputActive = active;
  const set = blockViewportListeners.get(leafId);
  if (set) for (const l of set) l();
}

export type WatermarkState = "visible" | "hidden" | "dead";

// Watermark gate: a block terminal that has never run a command, whose grid is
// still untouched, and whose input is empty. Synchronous so tab switches, slot
// rebinds and the Enter-to-OSC-133 gap never flash it over real content.
// "dead" is permanent and lets the component unmount for good. The grid check
// scans glyphs, not the cursor: the prompt integration prints a blank gap line
// at spawn, so the cursor sits below row 0 even on a visually empty terminal.
export function blockWatermarkState(leafId: string): WatermarkState {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return "dead";
  if (s.everSubmitted || s.blockDecorations?.hasAnyBlock()) return "dead";
  if (!s.blockDecorations || s.inputActive) return "hidden";
  const slot = getSlotForLeaf(leafId);
  if (!slot) return "hidden";
  const buf = slot.term.buffer.active;
  if (buf.baseY > 0) return "dead";
  const rows = Math.min(buf.length, slot.term.rows);
  for (let i = 0; i < rows; i++) {
    if (buf.getLine(i)?.translateToString(true)) return "dead";
  }
  return "visible";
}

export function leafIdForPty(ptyId: number): string | null {
  for (const [leafId, s] of sessions) {
    if (s.pty?.id === ptyId) return leafId;
  }
  return null;
}

export function ptyIdForTab(tabId: string): number | null {
  return sessions.get(tabId)?.pty?.id ?? null;
}

// Put focus on the scratchpad if open, otherwise the terminal. Used for every
// case that (re)focuses a leaf: workspace switches, tab switches, and
// restoring focus after a transient interruption (dropdown/dialog/context
// menu closing, OS window regaining focus, notification bell closing).
// scratchpadOpen already IS "should this leaf's scratchpad have focus right
// now" -- there's no separate "which side" to remember, since anything that
// took focus away from the scratchpad already closed it.
export function requestLeafFocus(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  if (s.scratchpadOpen) {
    requestScratchpadFocus(s);
  } else {
    focusSlot(leafId);
  }
}

configureRendererPool({
  resolveLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return null;
    return {
      writeToPty: (data) => {
        // "working" (spinner): only bare ESC (\x1b, 1 byte) or CTRL+C (\x03) clear it -
        // these are explicit user interrupts. Multi-byte ESC sequences (xterm protocol
        // auto-responses like "\x1b[?1;2c") must NOT clear the spinner.
        // The attention dot ("attention") is cleared by focusing the tab, not by typing.
        // The session is kept alive; only the visual indicator is cleared.
        const session = useAgentStore.getState().sessions[leafId];
        if (session && (data === "\x03" || data === "\x1b")) {
          useAgentStore.getState().setStatus(leafId, "idle");
        }
        if (s.pty) void s.pty.write(data);
        else queuePendingInput(s, data);
      },
      resizePty: (cols, rows) => {
        s.cols = cols;
        s.rows = rows;
        s.pty?.resize(cols, rows);
      },
      kickPty: (cols, rows) => {
        const pty = s.pty;
        if (!pty || cols <= 0 || rows <= 0) return;
        // Linux only emits SIGWINCH when the winsize ioctl actually
        // changes dims, so bump +1 row then restore. The TUI receives
        // (possibly two) SIGWINCHes and repaints from scratch.
        pty
          .resize(cols, rows + 1)
          .then(() => pty.resize(cols, rows))
          .catch((e) => console.warn("[kex] kickPty failed:", e));
      },
    };
  },
  evictLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return;
    unbindLeafFromSlot(leafId, s);
  },
  isLeafFocused(leafId) {
    const s = sessions.get(leafId);
    return !!s && s.visibleNow && s.focusedNow;
  },
  isLeafBlocks(leafId) {
    return sessions.get(leafId)?.blocks ?? false;
  },
  focusLeaf(leafId) {
    requestLeafFocus(leafId);
  },
});

function ensureSession(
  leafId: string,
  initialCwd?: string,
  blocks = false,
  initialScratchpadEnabled = false,
): Session {
  const existing = sessions.get(leafId);
  if (existing) return existing;

  const session: Session = {
    pty: null,
    ptyOpening: false,
    ptyGen: 0,
    initialCwd,
    persistentCommand: undefined,
    restoreBlock: null,
    lastCwd: null,
    pendingExit: null,
    shellExited: false,
    callbacks: {},
    visibleNow: false,
    focusedNow: false,
    disposed: false,
    ready: Promise.resolve(),
    cols: 0,
    rows: 0,
    container: null,
    snapshot: takeWakeBackdrop(leafId),
    searchQuery: null,
    dormantRing: new DormantRing(),
    pendingInput: "",
    hasSlot: false,
    blocks,
    blockMode: "prompt",
    blockListeners: new Set(),
    blockDecorations: null,
    integrationSeen: false,
    inputFocus: null,
    inputDraft: "",
    inputActive: false,
    everSubmitted: false,
    altScreenAtRelease: false,
    scratchpadOpen: initialScratchpadEnabled,
    scratchpadFocus: null,
    scratchpadFocusPending: false,
    scratchpadInsert: null,
    scratchpadDraft: "",
  };
  sessions.set(leafId, session);

  session.ready = (async () => {
    await ensureMonoFontsLoaded();
    await document.fonts.ready;
  })();

  return session;
}

function deliverPtyBytes(leafId: string, bytes: Uint8Array): void {
  const s = sessions.get(leafId);
  if (!s) return;
  const slot = getSlotForLeaf(leafId);
  if (slot) slot.term.write(bytes);
  else s.dormantRing.push(bytes);
}

async function openPtyForSession(
  leafId: string,
  s: Session,
  cwd: string | undefined,
): Promise<PtySession> {
  const startCols = s.cols > 0 ? s.cols : 80;
  const startRows = s.rows > 0 ? s.rows : 24;
  const myGen = s.ptyGen;
  return openPty(
    startCols,
    startRows,
    {
      onData: (bytes) => {
        if (s.ptyGen !== myGen) return;
        deliverPtyBytes(leafId, bytes);
      },
      onExit: (code) => {
        s.shellExited = true;
        s.pty = null;
        s.pendingInput = "";
        const slot = getSlotForLeaf(leafId);
        if (slot) slot.term.options.disableStdin = true;
        if (s.callbacks.onExit) s.callbacks.onExit(code);
        else s.pendingExit = code;
      },
    },
    cwd,
    s.blocks,
    leafId,
    usePreferencesStore.getState().terminalShell || undefined,
  );
}

function applyBlockMode(leafId: string, mode: BlockMode): void {
  const s = sessions.get(leafId);
  if (!s) return;
  s.blockMode = mode;
  const slot = getSlotForLeaf(leafId);
  if (slot) {
    const prompt = mode === "prompt";
    slot.term.options.disableStdin = prompt;
    // Disable the helper textarea at the prompt so a grid click can't focus the
    // xterm (no flashing cursor) and can't steal focus from the shell input.
    if (slot.term.textarea) slot.term.textarea.disabled = prompt;
    if (!prompt) {
      slot.term.focus();
    } else if (s.visibleNow && s.focusedNow) {
      const inputFocus = s.inputFocus;
      if (inputFocus) setTimeout(inputFocus, 0);
    }
  }
  for (const l of s.blockListeners) l();
}

function bindLeafToSlot(leafId: string, s: Session): void {
  if (!s.container) return;
  const altScreen = s.altScreenAtRelease;
  s.altScreenAtRelease = false;
  acquireSlot({
    leafId,
    container: s.container,
    snapshot: s.snapshot,
    altScreen,
    drainRing: (write) => s.dormantRing.drain(write),
    shellExited: s.shellExited,
    searchQuery: s.searchQuery,
    cols: s.cols,
    rows: s.rows,
    registerOsc: (term) => {
      if (s.blocks) {
        const deco = new BlockDecorations(term, {
          onCwd: (next) => {
            markSessionReady(leafId);
            if (s.lastCwd === next) return;
            s.lastCwd = next;
            s.callbacks.onCwd?.(next);
          },
          onMode: (mode) => applyBlockMode(leafId, mode),
          onViewport: () => {
            const set = blockViewportListeners.get(leafId);
            if (set) for (const l of set) l();
          },
        });
        s.blockDecorations = deco;
        const onGridFocus = () => {
          if (s.blockMode === "prompt") s.inputFocus?.();
        };
        term.textarea?.addEventListener("focus", onGridFocus);
        const osc52 = registerOsc52ClipboardHandler(term);
        return [
          () => {
            s.blockDecorations = null;
            osc52();
            deco.dispose();
            term.textarea?.removeEventListener("focus", onGridFocus);
          },
        ];
      }
      // Shared in-command flag - see osc-handlers.ts. The prompt tracker
      // flips it on OSC 133 B/C/D/A; the cwd handler reads it to ignore OSC
      // 7 emitted by untrusted command output (remote SSH, `cat` of an
      // attacker file, etc.).
      const shellState = createShellIntegrationState();
      const prompt = registerPromptTracker(term, shellState, (cmd, started) => {
        s.integrationSeen = true;
        s.callbacks.onRunningCommand?.(cmd, started);
      });
      const cwd = registerCwdHandler(
        term,
        (next) => {
          markSessionReady(leafId);
          if (s.lastCwd === next) return;
          s.lastCwd = next;
          s.callbacks.onCwd?.(next);
        },
        shellState,
      );
      const titleDispose = registerTitleHandler(term, (t) => setOscTitle(leafId, t));
      const osc52 = registerOsc52ClipboardHandler(term);
      return [prompt.dispose, cwd, titleDispose, osc52];
    },
    onSearchReady: (addon) => s.callbacks.onSearchReady?.(addon),
  });
  s.snapshot = null;
  s.hasSlot = true;
  if (s.blocks) applyBlockMode(leafId, s.blockMode);
  if (s.lastCwd !== null) s.callbacks.onCwd?.(s.lastCwd);
  if (s.pendingExit !== null) {
    const code = s.pendingExit;
    s.pendingExit = null;
    s.callbacks.onExit?.(code);
  }
}

function unbindLeafFromSlot(leafId: string, s: Session): void {
  if (!s.hasSlot) return;
  const out = releaseSlot(leafId);
  if (out) {
    s.snapshot = out.snapshot;
    if (out.cols > 0) s.cols = out.cols;
    if (out.rows > 0) s.rows = out.rows;
    s.altScreenAtRelease = out.altScreen;
  }
  s.hasSlot = false;
}

function attachSession(
  leafId: string,
  container: HTMLDivElement,
  callbacks: Callbacks,
): void {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.callbacks = callbacks;
  s.container = container;

  if (s.visibleNow) bindLeafToSlot(leafId, s);

  if (!s.pty && !s.ptyOpening && !s.shellExited && !s.restoreBlock) {
    void startLeaf(leafId, s);
  }
}

const restoreBlockListeners = new Map<string, Set<() => void>>();

function setRestoreBlock(leafId: string, s: Session, block: RestoreBlock | null): void {
  s.restoreBlock = block;
  setModalBlock(leafId, block);
  for (const l of restoreBlockListeners.get(leafId) ?? []) l();
}

function subscribeRestoreBlock(leafId: string, cb: () => void): () => void {
  let set = restoreBlockListeners.get(leafId);
  if (!set) {
    set = new Set();
    restoreBlockListeners.set(leafId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) restoreBlockListeners.delete(leafId);
  };
}

function blockStart(leafId: string, s: Session, block: RestoreBlock): void {
  s.ptyOpening = false;
  console.error(`[kex] terminal start blocked for tab ${leafId}: ${block.reason}`);
  if (block.agent) useAgentStore.getState().setRestoreError(leafId, leafId, block.agent, block.reason);
  if (block.restorable) setPendingRestore(leafId, block);
  setRestoreBlock(leafId, s, block);
}

// Starts the PTY of a leaf once restore plans are loaded. One place owns "what to inject on a
// restored terminal":
//   - had an agent (plan)             -> resume it, or hold the tab on its error
//   - no agent, has a saved command   -> run that command, or hold the tab if its directory is unusable
async function startLeaf(leafId: string, s: Session): Promise<void> {
  s.ptyOpening = true;
  await restorePlansReady();
  if (s.disposed || s.pty) {
    s.ptyOpening = false;
    return;
  }
  // Consume the plan before spawning so the PTY starts in the agent's cwd
  // directly, without needing a `cd` shell command.
  const held = consumeHeldBlock(leafId);
  if (held) {
    consumeRestorePlan(leafId);
    blockStart(leafId, s, held);
    return;
  }
  const plan = consumeRestorePlan(leafId);
  const input = {
    plan,
    persistentCommand: s.persistentCommand,
    initialCwd: s.initialCwd,
  };
  const checkDir = (path: string) =>
    invoke<string | null>("check_launch_dir", { path }).catch(() => null);
  const dirProblem = needsDirCheck(input) ? await checkDir(s.initialCwd ?? "") : null;
  const decision = decideStart({ ...input, dirProblem });
  if (s.disposed || s.pty) {
    s.ptyOpening = false;
    return;
  }
  if (decision.kind === "blocked") {
    blockStart(leafId, s, decision.block);
    return;
  }

  let pty: PtySession;
  try {
    pty = await openPtyForSession(leafId, s, decision.cwd);
  } catch (e) {
    // The tab may have been closed or hibernated while openPty was failing; blocking would
    // register a phantom agent session for a dead tab.
    if (s.disposed) {
      s.ptyOpening = false;
      return;
    }
    const command = plan?.resumeCmd || (s.persistentCommand ?? "");
    // Keeps the agent of a consumed plan so "Try again" fetches a fresh plan instead of falling
    // back to the saved command.
    const agent = decision.inject === "resume" ? plan?.agent : undefined;
    blockStart(leafId, s, openFailureBlock(e, decision.cwd, command, agent));
    return;
  }
  s.ptyOpening = false;
  if (s.disposed) {
    pty.close();
    return;
  }
  setPendingRestore(leafId, null);
  if (s.restoreBlock) setRestoreBlock(leafId, s, null);
  s.pty = pty;
  // The folder the shell actually started in, known before the first OSC 7;
  // a stale saved folder gives way to it the moment the PTY opens.
  applySpawnCwdReport(s, pty.cwd);
  if (s.pendingInput) {
    void pty.write(s.pendingInput);
    s.pendingInput = "";
  }
  if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
  if (decision.inject === "resume" && plan) {
    stageRestoredSnapshot(leafId, plan);
    void writeWhenShellReady(s, leafId, pty, ` ${plan.resumeCmd}\r`);
    watchResume(leafId, plan);
  } else if (decision.inject === "command" && s.persistentCommand) {
    void writeWhenShellReady(s, leafId, pty, `${s.persistentCommand}\r`);
  }
}

function restoreActionDeps(leafId: string, s: Session): RestoreActionDeps {
  return {
    setBlock: (block) => setRestoreBlock(leafId, s, block),
    finishAgent: () => useAgentStore.getState().clearRestoreError(leafId),
    previewPlan: () => previewResumeCmd(leafId),
    seedPlan: (plan) => seedRestorePlan(leafId, plan),
    detachAgent: () => detachAgentSession(leafId),
    start: () => startLeaf(leafId, s),
  };
}

export async function retryRestore(leafId: string): Promise<void> {
  const s = sessions.get(leafId);
  if (s) await withRestoreBusy(leafId, () => retryRestoreFlow(s, restoreActionDeps(leafId, s)));
}

const isAgentRunningIn = (leafId: string) =>
  isRunningAgentSession(useAgentStore.getState().sessions[leafId]);

function pendingActionDeps(leafId: string) {
  return {
    leafId,
    getBlock: () => getPendingRestore(leafId),
    setPending: (block: RestoreBlock | null) => setPendingRestore(leafId, block),
    isAgentRunning: () => isAgentRunningIn(leafId),
    clearPlaceholder: () => useAgentStore.getState().clearRestoreError(leafId),
  };
}

// A hand-launched agent replaces the failed-restore placeholder; the plan is then moot.
useAgentStore.subscribe((state) => {
  for (const leafId of pendingRestoreLeafIds()) {
    if (isRunningAgentSession(state.sessions[leafId])) setPendingRestore(leafId, null);
  }
});

// The menu's Retry restore is the dialog's Try again: a pending restore only exists while the
// terminal is held, because nothing starts the shell until it can run.
export async function retryPendingRestore(leafId: string): Promise<void> {
  if (sessions.get(leafId)?.restoreBlock) await retryRestore(leafId);
}

// The only place besides agent exit and tab close that deletes the agent session from the store.
export async function discardPendingRestore(leafId: string): Promise<void> {
  await discardPendingFlow({
    ...pendingActionDeps(leafId),
    detach: () => detachAgentSession(leafId).catch((e) => console.error("[kex] detach failed:", e)),
  });
}

function detachSession(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  dropParkedLeaf(parkedLeaves, leafId);
  unbindLeafFromSlot(leafId, s);
  s.callbacks = {};
  s.container = null;
}

export async function respawnSession(
  leafId: string,
  cwd?: string,
): Promise<void> {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.pty?.close();
  s.pty = null;
  s.ptyGen++;
  s.snapshot = null;
  s.dormantRing = new DormantRing();
  s.shellExited = false;
  s.pendingExit = null;
  s.pendingInput = "";
  s.altScreenAtRelease = false;
  clearOscTitle(leafId);

  const slot = getSlotForLeaf(leafId);
  if (slot) {
    slot.term.options.disableStdin = false;
    slot.term.clear();
    slot.term.reset();
  }

  s.ptyOpening = true;
  let pty: PtySession;
  try {
    pty = await openPtyForSession(leafId, s, cwd ?? s.initialCwd);
  } catch (e) {
    s.ptyOpening = false;
    console.error("[kex] respawn openPty failed:", e);
    return;
  }
  s.ptyOpening = false;
  if (s.disposed) {
    pty.close();
    return;
  }
  s.pty = pty;
  applySpawnCwdReport(s, pty.cwd);
  if (s.pendingInput) {
    void pty.write(s.pendingInput);
    s.pendingInput = "";
  }
  if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
}

// The folder reported by pty_open seeds lastCwd and reaches the tab (and the
// workspace cwd through it) without waiting for the shell's first OSC 7.
// Unchanged folders and PTYs that had no folder to report leave the tab as it
// was; the rebind path replays lastCwd as usual.
function applySpawnCwdReport(s: Session, reported: string | null): void {
  const next = spawnCwdUpdate(s.lastCwd, reported);
  if (!next) return;
  s.lastCwd = next;
  s.callbacks.onCwd?.(next);
}

export async function leafHasForegroundProcess(leafId: string): Promise<string | null> {
  const s = sessions.get(leafId);
  if (!s?.pty || s.shellExited) return null;
  try {
    return await invoke<string | null>("pty_has_foreground_process", { id: s.pty.id });
  } catch (e) {
    console.error("[kex] pty_has_foreground_process failed for leaf", leafId, e);
    return null;
  }
}

export function disposeSession(leafId: string): void {
  consumeHeldBlock(leafId);
  const s = sessions.get(leafId);
  if (!s) return;
  s.disposed = true;
  dropParkedLeaf(parkedLeaves, leafId);
  disposeLeafSlot(leafId);
  s.hasSlot = false;
  s.snapshot = null;
  s.pty?.close();
  s.pty = null;
  s.pendingInput = "";
  clearOscTitle(leafId);
  setPendingRestore(leafId, null);
  setModalBlock(leafId, null);
  sessions.delete(leafId);
  blockViewportListeners.delete(leafId);
  scratchpadListeners.delete(leafId);
  readyLeaves.delete(leafId);
  const waiters = readyWaiters.get(leafId);
  if (waiters) {
    readyWaiters.delete(leafId);
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.resolve();
    }
  }
}

// Push terminal-appearance preferences into the renderer pool exactly once
// per change, regardless of how many terminals are mounted. Each apply*
// function already loops over every slot in the pool, so subscribing once
// at module scope (instead of once per useTerminalSession instance) turns
// what used to be N identical full-pool passes (one per mounted terminal)
// into a single pass. Newly created slots don't need this: createSlot reads
// the current preferences directly (termOptions() in rendererPool.ts), so
// this subscription only has to react to a LIVE change while terminals
// already exist.
let poolPreferencesSyncStarted = false;

function startPoolPreferencesSync(): void {
  if (poolPreferencesSyncStarted) return;
  poolPreferencesSyncStarted = true;
  let prev = usePreferencesStore.getState();
  usePreferencesStore.subscribe((state) => {
    if (state.terminalFontSize !== prev.terminalFontSize || state.zoomLevel !== prev.zoomLevel) {
      applyZoomThenRefit(state.zoomLevel, state.hydrated, {
        applyZoomToDom,
        refitTerminals: () =>
          applyFontSize(renderFontSize(state.terminalFontSize, state.zoomLevel)),
      });
    }
    if (state.terminalFontFamily !== prev.terminalFontFamily) {
      applyFontFamily(state.terminalFontFamily);
    }
    if (state.terminalLetterSpacing !== prev.terminalLetterSpacing) {
      applyLetterSpacing(state.terminalLetterSpacing);
    }
    if (state.terminalFontWeight !== prev.terminalFontWeight) {
      applyFontWeight(state.terminalFontWeight);
    }
    if (state.terminalLineHeight !== prev.terminalLineHeight) {
      applyLineHeight(state.terminalLineHeight);
    }
    if (state.terminalScrollback !== prev.terminalScrollback) {
      applyScrollback(state.terminalScrollback);
    }
    if (state.terminalWebglEnabled !== prev.terminalWebglEnabled) {
      applyWebglPreference(state.terminalWebglEnabled);
    }
    if (state.terminalCursorBlink !== prev.terminalCursorBlink) {
      applyCursorBlink(state.terminalCursorBlink);
    }
    if (state.terminalCursorStyle !== prev.terminalCursorStyle) {
      applyCursorStyle(state.terminalCursorStyle);
    }
    if (state.terminalCursorInactiveStyle !== prev.terminalCursorInactiveStyle) {
      applyCursorInactiveStyle(state.terminalCursorInactiveStyle);
    }
    if (state.terminalCursorWidth !== prev.terminalCursorWidth) {
      applyCursorWidth(state.terminalCursorWidth);
    }
    if (state.terminalScrollSensitivity !== prev.terminalScrollSensitivity) {
      applyScrollSensitivity(state.terminalScrollSensitivity);
    }
    prev = state;
  });
}

startPoolPreferencesSync();

type Options = {
  leafId: string;
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  focused?: boolean;
  initialCwd?: string;
  blocks?: boolean;
  persistentCommand?: string;
  initialScratchpadEnabled?: boolean;
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onRunningCommand?: (cmd: string | null, started?: boolean) => void;
  onScratchpadEnabled?: (enabled: boolean) => void;
};

export function useTerminalSession({
  leafId,
  container,
  visible,
  focused = true,
  initialCwd,
  blocks = false,
  persistentCommand,
  initialScratchpadEnabled,
  onSearchReady,
  onExit,
  onCwd,
  onRunningCommand,
  onScratchpadEnabled,
}: Options) {
  const cbRef = useRef({
    onSearchReady,
    onExit,
    onCwd,
    onRunningCommand,
    onScratchpadEnabled,
  });
  cbRef.current = {
    onSearchReady,
    onExit,
    onCwd,
    onRunningCommand,
    onScratchpadEnabled,
  };

  // initialCwd seeds the first PTY spawn only. It must NOT be an effect dep:
  // OSC 7 updates the leaf cwd on every `cd`, and re-running the bind effect
  // would detach/rebind the renderer slot (disposing block markers) on each cd.
  const initialCwdRef = useRef(initialCwd);
  initialCwdRef.current = initialCwd;
  // The Restore Command is read once at the first PTY spawn (startup), so keep
  // it in a ref and off the effect deps just like initialCwd.
  const restoreCommandRef = useRef(persistentCommand);
  restoreCommandRef.current = persistentCommand;
  // Seeds the initial scratchpad enabled flag on session creation only (restore).
  const initialScratchpadEnabledRef = useRef(initialScratchpadEnabled);

  useEffect(() => {
    let cancelled = false;
    const s = ensureSession(
      leafId,
      initialCwdRef.current,
      blocks,
      initialScratchpadEnabledRef.current,
    );
    s.persistentCommand = restoreCommandRef.current;
    s.ready.then(() => {
      if (cancelled || s.disposed) return;
      const node = container.current;
      if (!node) return;
      attachSession(leafId, node, {
        onSearchReady: (a) => cbRef.current.onSearchReady?.(a),
        onExit: (c) => cbRef.current.onExit?.(c),
        onCwd: (c) => cbRef.current.onCwd?.(c),
        onRunningCommand: (cmd, started) => cbRef.current.onRunningCommand?.(cmd, started),
        onScratchpadEnabled: (enabled) => cbRef.current.onScratchpadEnabled?.(enabled),
      });
      if (s.visibleNow && s.focusedNow && !s.blocks) {
        // Honor the scratchpad on first ready (new terminal opened with it,
        // or a restored tab whose scratchpad was enabled).
        if (s.scratchpadOpen) requestScratchpadFocus(s);
        else focusSlot(leafId);
      }
    });
    return () => {
      cancelled = true;
      detachSession(leafId);
    };
  }, [leafId, container, blocks]);

  const [blockMode, setBlockMode] = useState<BlockMode>("prompt");
  useEffect(() => {
    if (!blocks) return;
    const s = ensureSession(
      leafId,
      initialCwdRef.current,
      blocks,
      initialScratchpadEnabledRef.current,
    );
    setBlockMode(s.blockMode);
    const cb = () => setBlockMode(sessions.get(leafId)?.blockMode ?? "prompt");
    s.blockListeners.add(cb);
    return () => {
      s.blockListeners.delete(cb);
    };
  }, [leafId, blocks]);

  const restoreBlock = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeRestoreBlock(leafId, cb), [leafId]),
    () => sessions.get(leafId)?.restoreBlock ?? null,
  );

  const [scratchpadOpen, setScratchpadOpen] = useState<boolean>(
    () => sessions.get(leafId)?.scratchpadOpen ?? false,
  );
  useEffect(() => {
    const s = ensureSession(
      leafId,
      initialCwdRef.current,
      blocks,
      initialScratchpadEnabledRef.current,
    );
    setScratchpadOpen(s.scratchpadOpen);
    const cb = () => {
      setScratchpadOpen(sessions.get(leafId)?.scratchpadOpen ?? false);
    };
    return subscribeLeafScratchpad(leafId, cb);
  }, [leafId, blocks]);

  // Applying these to the renderer pool on change is handled once, at module
  // scope, by startPoolPreferencesSync above; see its comment for why a
  // per-instance effect here would redo the same full-pool pass once per
  // mounted terminal.
  const scrollback = usePreferencesStore((p) => p.terminalScrollback);
  const backgroundMemoryBudgetMB = usePreferencesStore(
    (p) => p.terminalBackgroundMemoryBudgetMB,
  );
  useEffect(() => {
    scheduleParkedLeafSweep();
  }, [backgroundMemoryBudgetMB, scrollback]);

  const wasFocusedRef = useRef(false);
  useEffect(() => {
    const s = sessions.get(leafId);
    if (!s) return;
    s.visibleNow = visible;
    s.focusedNow = focused;
    if (visible) {
      dropParkedLeaf(parkedLeaves, leafId);
      if (s.container && !s.hasSlot) bindLeafToSlot(leafId, s);
      else if (s.hasSlot) refreshLeafSlot(leafId);
      setSlotFocused(leafId, focused);
      // Only seize focus on the transition to focused-and-visible. Re-running
      // for other reasons (theme, fonts, sibling visibility) must not yank focus
      // back from wherever the user just moved it (e.g. another tab). This is
      // the path that moves DOM focus on keyboard pane switches (focusPane only
      // updates React state), so it must go through requestLeafFocus like every
      // other focus-a-leaf call site, or it silently bypasses the resume mark.
      const gained = visible && focused && !wasFocusedRef.current;
      if (gained && !blocks) requestLeafFocus(leafId);
    } else if (s.hasSlot) {
      if (s.blocks || isLeafAltScreen(leafId)) parkLeafSlot(leafId);
      else parkOrReleaseLeaf(leafId);
    }
    wasFocusedRef.current = visible && focused;
  }, [leafId, visible, focused, blocks]);

  const write = useCallback(
    (data: string) => {
      const s = sessions.get(leafId);
      if (!s || s.shellExited) return;
      if (s.pty) void s.pty.write(data);
      else queuePendingInput(s, data);
    },
    [leafId],
  );

  const focus = useCallback(() => focusSlot(leafId), [leafId]);

  const getBuffer = useCallback(
    (maxLines = 200): string | null => {
      const s = sessions.get(leafId);
      if (!s) return null;
      const slot = getSlotForLeaf(leafId);
      if (slot) {
        const buf = slot.term.buffer.active;
        const total = buf.length;
        const lines: string[] = [];
        const start = Math.max(0, total - maxLines);
        for (let i = start; i < total; i++) {
          lines.push(buf.getLine(i)?.translateToString(true) ?? "");
        }
        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        return lines.join("\n");
      }
      if (!s.snapshot) return "";
      const plain = stripAnsi(s.snapshot);
      const lines = plain.split(/\r?\n/);
      const tail = lines.slice(-maxLines);
      while (tail.length && tail[tail.length - 1] === "") tail.pop();
      return tail.join("\n");
    },
    [leafId],
  );

  const getSelection = useCallback((): string | null => {
    const slot = getSlotForLeaf(leafId);
    const sel = slot?.term.getSelection() ?? "";
    return sel.length > 0 ? sel : null;
  }, [leafId]);

  const applyTheme = useCallback(() => {
    applyPoolTheme();
  }, []);

  const selectBlockAt = useCallback(
    (clientY: number) =>
      sessions.get(leafId)?.blockDecorations?.selectBlockAt(clientY),
    [leafId],
  );

  const readBlockId = useCallback(
    (id: string) =>
      sessions.get(leafId)?.blockDecorations?.readById(id) ?? null,
    [leafId],
  );

  const subscribeBlocks = useCallback(
    (cb: () => void) => {
      let set = blockViewportListeners.get(leafId);
      if (!set) {
        set = new Set();
        blockViewportListeners.set(leafId, set);
      }
      set.add(cb);
      return () => {
        const live = blockViewportListeners.get(leafId);
        live?.delete(cb);
        if (live && live.size === 0) blockViewportListeners.delete(leafId);
      };
    },
    [leafId],
  );

  const visibleBlocks = useCallback(
    (): VisibleBlocks =>
      sessions.get(leafId)?.blockDecorations?.visibleBlocks() ?? {
        blocks: [],
        sticky: null,
      },
    [leafId],
  );

  const searchBlock = useCallback(
    (id: string, query: string) =>
      sessions.get(leafId)?.blockDecorations?.searchBlock(id, query) ?? [],
    [leafId],
  );

  const revealMatch = useCallback(
    (m: BlockMatch) => sessions.get(leafId)?.blockDecorations?.revealMatch(m),
    [leafId],
  );

  const clearSearch = useCallback(
    () => sessions.get(leafId)?.blockDecorations?.clearSearch(),
    [leafId],
  );

  return useMemo(
    () => ({
      write,
      focus,
      getBuffer,
      getSelection,
      applyTheme,
      blockMode,
      selectBlockAt,
      readBlockId,
      subscribeBlocks,
      visibleBlocks,
      searchBlock,
      revealMatch,
      clearSearch,
      scratchpadOpen,
      restoreBlock,
    }),
    [
      write,
      focus,
      getBuffer,
      getSelection,
      applyTheme,
      blockMode,
      selectBlockAt,
      readBlockId,
      subscribeBlocks,
      visibleBlocks,
      searchBlock,
      revealMatch,
      clearSearch,
      scratchpadOpen,
      restoreBlock,
    ],
  );
}

const ANSI_RE =
  /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b[78=>]|\x1bc|\x1b[NOP\]X^_]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function terminalDebugStats() {
  const liveSessions = [...sessions.entries()].map(([leafId, s]) => ({
    leafId,
    pty: !!s.pty,
    visible: s.visibleNow,
    focused: s.focusedNow,
    hasSlot: s.hasSlot,
    ringBytes: s.dormantRing.byteLength(),
    snapshotLen: s.snapshot?.length ?? 0,
    shellExited: s.shellExited,
  }));
  const ringTotal = liveSessions.reduce((n, s) => n + s.ringBytes, 0);
  const snapshotTotal = liveSessions.reduce((n, s) => n + s.snapshotLen, 0);
  const slots = poolSlotStats();
  return {
    poolSize: poolSize(),
    webglContexts: slots.filter((s) => s.webgl).length,
    idleSlots: slots.filter((s) => s.leafId === null).length,
    slots,
    sessionCount: liveSessions.length,
    sessions: liveSessions,
    ringBytesTotal: ringTotal,
    snapshotCharsTotal: snapshotTotal,
    domCanvases: document.querySelectorAll("canvas").length,
    domScreens: document.querySelectorAll(".xterm-screen").length,
    domRows: document.querySelectorAll(".xterm-rows > div").length,
    jsHeapBytes:
      (performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize ?? null,
  };
}

export function refreshTerminalLeaf(leafId: string): void {
  refreshLeafSlot(leafId);
}

if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __kexTerm?: unknown }).__kexTerm =
    terminalDebugStats;
}
