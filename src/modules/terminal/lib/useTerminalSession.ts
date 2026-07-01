import { invoke } from "@tauri-apps/api/core";
import { consumeRestorePlan, restorePlansReady } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { ensureMonoFontsLoaded } from "@/lib/fonts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  type ScratchpadState,
  scratchpadStateOf,
} from "@/modules/workspaces/lib/types";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DormantRing } from "./dormantRing";
import { shouldFireOnRegister, tryRequestFocus } from "./pendingFocus";
import type { BlockMode } from "../block/lib/modeMachine";
import {
  createShellIntegrationState,
  registerCwdHandler,
  registerOsc52ClipboardHandler,
  registerPromptTracker,
  registerTitleHandler,
} from "./osc-handlers";
import { clearOscTitle, setOscTitle } from "./oscTitleStore";
import { openPty, type PtySession } from "./pty-bridge";
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
  onRunningCommand?: (cmd: string | null) => void;
  onScratchpadState?: (state: ScratchpadState) => void;
};

type Session = {
  pty: PtySession | null;
  ptyOpening: boolean;
  ptyGen: number;
  initialCwd: string | undefined;
  // "Run on start" config, captured at startup. On the first PTY spawn the
  // session decides what to inject: the agent resume (if it had an agent) or
  // this command (otherwise). `restoreOnRestart === false` disables both.
  restoreOnRestart: boolean | undefined;
  persistentCommand: string | undefined;
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
  scratchpadOpen: boolean;
  scratchpadFocused: boolean;
  // Which side the leaf was last working on: true = scratchpad, false = terminal.
  // Survives tab blur so re-focusing the tab restores that side.
  scratchpadActive: boolean;
  scratchpadFocus: (() => void) | null;
  // A focus request arrived before ScratchpadBar mounted and registered
  // scratchpadFocus (restore, or a just-created terminal). Consumed as soon
  // as the callback registers, instead of guessing how many ticks to wait.
  scratchpadFocusPending: boolean;
  scratchpadInsert: ((text: string) => void) | null;
  scratchpadDraft: string;
};

const sessions = new Map<string, Session>();

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

export function interruptLeaf(leafId: string): void {
  clearAgentSessionForLeaf(leafId);
  sessions.get(leafId)?.pty?.write("\x03");
}

export function leafCwd(leafId: string): string | null {
  return sessions.get(leafId)?.lastCwd ?? null;
}

export function getLeafBlockMode(leafId: string): BlockMode {
  return sessions.get(leafId)?.blockMode ?? "prompt";
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
    set.delete(cb);
  };
}

// Persist the open/active pair (hidden | visible | focused) for restore.
function notifyScratchpadState(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  s.callbacks.onScratchpadState?.(
    scratchpadStateOf(s.scratchpadOpen, s.scratchpadActive),
  );
}

function requestScratchpadFocus(s: Session): void {
  if (!tryRequestFocus(s.scratchpadFocus)) s.scratchpadFocusPending = true;
}

export function cycleScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s || s.shellExited) return;
  if (!s.scratchpadOpen) {
    s.scratchpadOpen = true;
    s.scratchpadActive = true;
    notifyScratchpad(leafId);
    requestScratchpadFocus(s);
  } else if (s.scratchpadFocused) {
    s.scratchpadActive = false;
    s.scratchpadFocusPending = false;
    focusSlot(leafId);
  } else {
    s.scratchpadActive = true;
    requestScratchpadFocus(s);
  }
  notifyScratchpadState(leafId);
}

export function closeScratchpad(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  if (!s.scratchpadOpen) return;
  s.scratchpadOpen = false;
  s.scratchpadActive = false;
  s.scratchpadFocused = false;
  s.scratchpadFocusPending = false;
  notifyScratchpad(leafId);
  notifyScratchpadState(leafId);
  focusSlot(leafId);
}

export function setLeafScratchpadActive(leafId: string, active: boolean): void {
  const s = sessions.get(leafId);
  if (!s || s.scratchpadActive === active) return;
  s.scratchpadActive = active;
  if (!active) s.scratchpadFocusPending = false;
  notifyScratchpadState(leafId);
}

export function leafScratchpadOpen(leafId: string): boolean {
  return sessions.get(leafId)?.scratchpadOpen ?? false;
}

export function toggleScratchpad(leafId: string): void {
  if (leafScratchpadOpen(leafId)) closeScratchpad(leafId);
  else cycleScratchpad(leafId);
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
    fn?.();
  }
}

export function setLeafScratchpadFocused(
  leafId: string,
  focused: boolean,
): void {
  const s = sessions.get(leafId);
  if (!s || s.scratchpadFocused === focused) return;
  s.scratchpadFocused = focused;
  notifyScratchpad(leafId);
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
 * the active prompt line — macOS Terminal's ⌘K behaviour. Returns false when no
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

// Put focus on whichever side this leaf's session is on (scratchpad if open
// and active, otherwise the terminal). Callers that drive focus purely from
// derived `visible`/`focused` props (the useTerminalSession effect) only
// re-run when those props change; explicit user actions that don't change
// them (e.g. re-activating a tab that was already the pane's active tab)
// need this to reassert focus after anything else may have stolen it.
export function requestLeafFocus(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
  if (s.scratchpadOpen && s.scratchpadActive) requestScratchpadFocus(s);
  else focusSlot(leafId);
}

configureRendererPool({
  resolveLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return null;
    return {
      writeToPty: (data) => {
        // "working" (spinner): only bare ESC (\x1b, 1 byte) or CTRL+C (\x03) clear it —
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
  initialScratchpad?: ScratchpadState,
): Session {
  const existing = sessions.get(leafId);
  if (existing) return existing;

  const session: Session = {
    pty: null,
    ptyOpening: false,
    ptyGen: 0,
    initialCwd,
    restoreOnRestart: undefined,
    persistentCommand: undefined,
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
    snapshot: null,
    searchQuery: null,
    dormantRing: new DormantRing(),
    pendingInput: "",
    hasSlot: false,
    blocks,
    blockMode: "prompt",
    blockListeners: new Set(),
    blockDecorations: null,
    inputFocus: null,
    inputDraft: "",
    inputActive: false,
    everSubmitted: false,
    altScreenAtRelease: false,
    scratchpadOpen: initialScratchpad ? initialScratchpad !== "hidden" : false,
    scratchpadFocused: false,
    scratchpadActive: initialScratchpad === "focused",
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
      // Shared in-command flag — see osc-handlers.ts. The prompt tracker
      // flips it on OSC 133 B/C/D/A; the cwd handler reads it to ignore OSC
      // 7 emitted by untrusted command output (remote SSH, `cat` of an
      // attacker file, etc.).
      const shellState = createShellIntegrationState();
      const prompt = registerPromptTracker(term, shellState, (cmd) => s.callbacks.onRunningCommand?.(cmd));
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

  if (!s.pty && !s.ptyOpening && !s.shellExited) {
    s.ptyOpening = true;
    // Wait until restore plans are loaded so the consume decision is correct,
    // then spawn. One place owns "what to inject on a restored terminal":
    //   - "Run on start" off              -> nothing
    //   - had an agent (plan)             -> resume it (or surface its error)
    //   - no agent, has a saved command   -> run that command
    void restorePlansReady().then(() => {
      if (s.disposed || s.pty) {
        s.ptyOpening = false;
        return;
      }
      // Consume the plan before spawning so the PTY starts in the agent's cwd
      // directly, without needing a `cd` shell command.
      const plan = consumeRestorePlan(leafId);
      const runOnStart = s.restoreOnRestart !== false;
      const ptyCwd = runOnStart && plan?.resumeCmd ? plan.cwdLaunch : s.initialCwd;

      openPtyForSession(leafId, s, ptyCwd)
        .then((pty) => {
          s.ptyOpening = false;
          if (s.disposed) {
            pty.close();
            return;
          }
          s.pty = pty;
          if (s.pendingInput) {
            void pty.write(s.pendingInput);
            s.pendingInput = "";
          }
          if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
          if (!runOnStart) return;
          if (plan) {
            if (plan.resumeCmd) {
              setTimeout(() => {
                s.pty?.write(" " + plan.resumeCmd + "\r");
              }, 200);
            } else if (plan.errorReason) {
              console.error(`[kex] session restore failed for tab ${leafId} (${plan.agent}): ${plan.errorReason}`);
              useAgentStore.getState().setRestoreError(leafId, leafId, plan.agent, plan.errorReason);
            }
            // else: no command, no error - PTY just opened at plan.cwdLaunch, nothing to do
          } else if (s.persistentCommand) {
            const cmd = s.persistentCommand;
            setTimeout(() => {
              s.pty?.write(cmd + "\r");
            }, 300);
          }
        })
        .catch((e) => {
          s.ptyOpening = false;
          console.error("[kex] openPty failed:", e);
        });
    });
  }
}

function detachSession(leafId: string): void {
  const s = sessions.get(leafId);
  if (!s) return;
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
  if (s.pendingInput) {
    void pty.write(s.pendingInput);
    s.pendingInput = "";
  }
  if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
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
  const s = sessions.get(leafId);
  if (!s) return;
  s.disposed = true;
  disposeLeafSlot(leafId);
  s.hasSlot = false;
  s.snapshot = null;
  s.pty?.close();
  s.pty = null;
  s.pendingInput = "";
  clearOscTitle(leafId);
  sessions.delete(leafId);
  blockViewportListeners.delete(leafId);
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

type Options = {
  leafId: string;
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  focused?: boolean;
  initialCwd?: string;
  blocks?: boolean;
  restoreOnRestart?: boolean;
  persistentCommand?: string;
  initialScratchpad?: ScratchpadState;
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onRunningCommand?: (cmd: string | null) => void;
  onScratchpadState?: (state: ScratchpadState) => void;
};

export function useTerminalSession({
  leafId,
  container,
  visible,
  focused = true,
  initialCwd,
  blocks = false,
  restoreOnRestart,
  persistentCommand,
  initialScratchpad,
  onSearchReady,
  onExit,
  onCwd,
  onRunningCommand,
  onScratchpadState,
}: Options) {
  const cbRef = useRef({
    onSearchReady,
    onExit,
    onCwd,
    onRunningCommand,
    onScratchpadState,
  });
  cbRef.current = {
    onSearchReady,
    onExit,
    onCwd,
    onRunningCommand,
    onScratchpadState,
  };

  // initialCwd seeds the first PTY spawn only. It must NOT be an effect dep:
  // OSC 7 updates the leaf cwd on every `cd`, and re-running the bind effect
  // would detach/rebind the renderer slot (disposing block markers) on each cd.
  const initialCwdRef = useRef(initialCwd);
  initialCwdRef.current = initialCwd;
  // Run-on-start config is read once at the first PTY spawn (startup), so keep
  // it in refs and off the effect deps just like initialCwd.
  const runOnStartRef = useRef({ restoreOnRestart, persistentCommand });
  runOnStartRef.current = { restoreOnRestart, persistentCommand };
  // Seeds the initial scratchpad visibility on session creation only (restore).
  const initialScratchpadRef = useRef(initialScratchpad);

  useEffect(() => {
    let cancelled = false;
    const s = ensureSession(
      leafId,
      initialCwdRef.current,
      blocks,
      initialScratchpadRef.current,
    );
    s.restoreOnRestart = runOnStartRef.current.restoreOnRestart;
    s.persistentCommand = runOnStartRef.current.persistentCommand;
    s.ready.then(() => {
      if (cancelled || s.disposed) return;
      const node = container.current;
      if (!node) return;
      attachSession(leafId, node, {
        onSearchReady: (a) => cbRef.current.onSearchReady?.(a),
        onExit: (c) => cbRef.current.onExit?.(c),
        onCwd: (c) => cbRef.current.onCwd?.(c),
        onRunningCommand: (cmd) => cbRef.current.onRunningCommand?.(cmd),
        onScratchpadState: (st) => cbRef.current.onScratchpadState?.(st),
      });
      if (s.visibleNow && s.focusedNow && !s.blocks) {
        // Honor the scratchpad as the active side on first ready (new terminal
        // opened with it, or a restored tab that was focused there).
        if (s.scratchpadOpen && s.scratchpadActive) requestScratchpadFocus(s);
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
      initialScratchpadRef.current,
    );
    setBlockMode(s.blockMode);
    const cb = () => setBlockMode(sessions.get(leafId)?.blockMode ?? "prompt");
    s.blockListeners.add(cb);
    return () => {
      s.blockListeners.delete(cb);
    };
  }, [leafId, blocks]);

  const [scratchpadOpen, setScratchpadOpen] = useState<boolean>(
    () => sessions.get(leafId)?.scratchpadOpen ?? false,
  );
  const [scratchpadFocused, setScratchpadFocusedState] = useState<boolean>(
    () => sessions.get(leafId)?.scratchpadFocused ?? false,
  );
  useEffect(() => {
    const s = ensureSession(
      leafId,
      initialCwdRef.current,
      blocks,
      initialScratchpadRef.current,
    );
    setScratchpadOpen(s.scratchpadOpen);
    setScratchpadFocusedState(s.scratchpadFocused);
    const cb = () => {
      const cur = sessions.get(leafId);
      setScratchpadOpen(cur?.scratchpadOpen ?? false);
      setScratchpadFocusedState(cur?.scratchpadFocused ?? false);
    };
    return subscribeLeafScratchpad(leafId, cb);
  }, [leafId, blocks]);

  const fontSize = usePreferencesStore((p) => p.terminalFontSize);
  const zoomLevel = usePreferencesStore((p) => p.zoomLevel);
  useEffect(() => {
    applyFontSize(renderFontSize(fontSize, zoomLevel));
  }, [fontSize, zoomLevel]);

  const fontFamily = usePreferencesStore((p) => p.terminalFontFamily);
  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  const letterSpacing = usePreferencesStore((p) => p.terminalLetterSpacing);
  useEffect(() => {
    applyLetterSpacing(letterSpacing);
  }, [letterSpacing]);

  const fontWeight = usePreferencesStore((p) => p.terminalFontWeight);
  useEffect(() => {
    applyFontWeight(fontWeight);
  }, [fontWeight]);

  const lineHeight = usePreferencesStore((p) => p.terminalLineHeight);
  useEffect(() => {
    applyLineHeight(lineHeight);
  }, [lineHeight]);

  const scrollback = usePreferencesStore((p) => p.terminalScrollback);
  useEffect(() => {
    applyScrollback(scrollback);
  }, [scrollback]);

  const webglPref = usePreferencesStore((p) => p.terminalWebglEnabled);
  useEffect(() => {
    applyWebglPreference(webglPref);
  }, [webglPref]);

  const cursorBlink = usePreferencesStore((p) => p.terminalCursorBlink);
  useEffect(() => {
    applyCursorBlink(cursorBlink);
  }, [cursorBlink]);

  const cursorStyle = usePreferencesStore((p) => p.terminalCursorStyle);
  useEffect(() => {
    applyCursorStyle(cursorStyle);
  }, [cursorStyle]);

  const cursorInactiveStyle = usePreferencesStore(
    (p) => p.terminalCursorInactiveStyle,
  );
  useEffect(() => {
    applyCursorInactiveStyle(cursorInactiveStyle);
  }, [cursorInactiveStyle]);

  const cursorWidth = usePreferencesStore((p) => p.terminalCursorWidth);
  useEffect(() => {
    applyCursorWidth(cursorWidth);
  }, [cursorWidth]);

  const scrollSensitivity = usePreferencesStore(
    (p) => p.terminalScrollSensitivity,
  );
  useEffect(() => {
    applyScrollSensitivity(scrollSensitivity);
  }, [scrollSensitivity]);

  const wasFocusedRef = useRef(false);
  useEffect(() => {
    const s = sessions.get(leafId);
    if (!s) return;
    s.visibleNow = visible;
    s.focusedNow = focused;
    if (visible) {
      if (s.container && !s.hasSlot) bindLeafToSlot(leafId, s);
      else if (s.hasSlot) refreshLeafSlot(leafId);
      setSlotFocused(leafId, focused);
      // Only seize focus on the transition to focused-and-visible. Re-running
      // for other reasons (theme, fonts, sibling visibility) must not yank focus
      // back from wherever the user just moved it (e.g. another tab).
      const gained = visible && focused && !wasFocusedRef.current;
      if (gained && !blocks) {
        if (s.scratchpadOpen && s.scratchpadActive) requestScratchpadFocus(s);
        else focusSlot(leafId);
      }
    } else if (s.hasSlot) {
      if (s.blocks || isLeafAltScreen(leafId)) parkLeafSlot(leafId);
      else unbindLeafFromSlot(leafId, s);
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
      scratchpadFocused,
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
      scratchpadFocused,
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
