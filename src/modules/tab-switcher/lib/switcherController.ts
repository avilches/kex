import { create } from "zustand";
import type { TabEntry } from "@/modules/command-palette";
import {
  REVEAL_DELAY_MS,
  afterRemoval,
  digitIndex,
  heldModifiers,
  modifiersReleased,
  pointerMoved,
  rowIndex,
  startIndex,
  stepIndex,
  type Held,
  type Point,
} from "./switcherModel";

type SwitcherState = {
  // What the app lent this session, for the footer to announce only the keys that work.
  keys: { close: boolean; sleep: string | null };
  // Painted only after REVEAL_DELAY_MS, or at once on a second step: a tap never flashes the overlay.
  revealed: boolean;
  entries: TabEntry[];
  index: number;
};

export const useSwitcherStore = create<SwitcherState>(() => ({
  keys: { close: false, sleep: null },
  revealed: false,
  entries: [],
  index: 0,
}));

// What the app does to close a tab: nothing returned means it refused (a locked tab), otherwise whether
// the tab really went, since a confirmation may have been cancelled.
export type CloseTab = (entry: TabEntry) => Promise<boolean> | undefined;

// What the app does to put a tab to sleep or wake it: the refreshed entry of the tab (its tile stays and
// shows the new state), "dismiss" when the app opened a dialog the overlay would hide (the switcher closes
// and the user decides there), null when the user cancelled, and nothing when the tab cannot sleep at all.
export type SleepTab = (entry: TabEntry) => Promise<TabEntry | "dismiss" | null> | undefined;

// What the app lends the switcher beyond choosing a tab. `sleepKey` is the bare letter of the hibernate
// shortcut at the moment it opens, so rebinding the shortcut moves the key with it.
export type SwitcherHooks = { onClose?: CloseTab; onSleep?: SleepTab; sleepKey?: string | null };

type Session = {
  held: Held;
  onCommit: (entry: TabEntry) => void;
  hooks: SwitcherHooks;
  timer: ReturnType<typeof setTimeout> | null;
  pointer: Point | null;
  // A close is waiting on the host, which may be asking the user to confirm it: the keys belong to that
  // dialog meanwhile, and letting go of the modifier must not commit a jump behind it.
  busy: boolean;
  // The menu is closing because of an Escape pressed with the modifier held: the overlay stays.
  escapeKeeps: boolean;
};

// One switcher per window and it lives outside React: the keys that drive it arrive while the
// modifier is held, and no render may sit between the key and the state.
let session: Session | null = null;

export const switcherActive = () => session !== null;

function reveal() {
  if (!session) return;
  if (session.timer !== null) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  if (!useSwitcherStore.getState().revealed) useSwitcherStore.setState({ revealed: true });
}

function end() {
  if (!session) return;
  if (session.timer !== null) clearTimeout(session.timer);
  session = null;
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("keyup", onKeyUp, true);
  window.removeEventListener("blur", cancelSwitcher);
  window.removeEventListener("contextmenu", onContextMenu);
  delete document.body.dataset.switcherMenu;
  useSwitcherStore.setState({ keys: { close: false, sleep: null }, revealed: false, entries: [], index: 0 });
}

export function cancelSwitcher() {
  end();
}

export function commitSwitcher(at?: number) {
  if (!session) return;
  const { entries, index } = useSwitcherStore.getState();
  const entry = entries[at ?? index];
  const { onCommit } = session;
  end();
  if (entry) onCommit(entry);
}

export function stepSwitcher(delta: number) {
  if (!session || session.busy) return;
  const { entries, index } = useSwitcherStore.getState();
  useSwitcherStore.setState({ index: stepIndex(index, entries.length, delta) });
  reveal();
}

// Closes the highlighted tab through the host given when it opened, which does what the rest of the app does (a locked tab refuses,
// an unsaved document asks) and says whether the tab is really gone. Only then does its tile leave, so a
// cancelled confirmation leaves everything as it was. The host returns nothing to refuse without closing.
async function closeSelected(): Promise<void> {
  const current = session;
  if (!current || current.busy) return;
  const close = current.hooks.onClose;
  if (!close) return;
  const { entries, index } = useSwitcherStore.getState();
  const entry = entries[index];
  if (!entry) return;
  current.busy = true;
  let closed = false;
  try {
    closed = (await close(entry)) === true;
  } finally {
    current.busy = false;
  }
  if (session !== current || !closed) return;
  const left = useSwitcherStore.getState();
  const next = afterRemoval(left.entries, left.index, entry.tabId);
  if (!next) return end();
  useSwitcherStore.setState(next);
}

// Hibernates or restores the highlighted tab through the app, which does what the shortcut does everywhere
// else (a working agent asks first). The tile stays and takes the refreshed entry, so it shows the moon or
// loses it in place; the highlight does not move. It waits like a close does, with the keys left to the dialog.
async function sleepSelected(): Promise<void> {
  const current = session;
  if (!current || current.busy) return;
  const sleep = current.hooks.onSleep;
  if (!sleep) return;
  const { entries, index } = useSwitcherStore.getState();
  const entry = entries[index];
  if (!entry) return;
  current.busy = true;
  let fresh: TabEntry | "dismiss" | null = null;
  try {
    fresh = (await sleep(entry)) ?? null;
  } finally {
    current.busy = false;
  }
  if (session !== current || !fresh) return;
  if (fresh === "dismiss") return end();
  const now = useSwitcherStore.getState();
  const at = now.entries.findIndex((e) => e.tabId === entry.tabId);
  if (at < 0) return;
  const next = [...now.entries];
  next[at] = fresh;
  useSwitcherStore.setState({ entries: next });
}

// Fed by the tiles on every pointer move. The reference point only advances when the pointer really
// travelled, so a slow drift cannot add up to a pick, and a still cursor never picks anything.
export function hoverSwitcher(index: number, at: Point) {
  if (!session || session.busy) return;
  const moved = pointerMoved(session.pointer, at);
  if (session.pointer === null || moved) session.pointer = at;
  if (moved) useSwitcherStore.setState({ index });
}

// A tile's context menu opened or closed. While it is open the keys and the pointer belong to the menu
// (the same hold a close waiting on a dialog has), the tile it opened on is the highlighted one, and the
// body is flagged so the menu is drawn above the overlay. Any way of closing the menu, an item or a click
// outside, also ends the switcher without going to any tab: an item that should go to one does it itself.
export function menuSwitcher(open: boolean, index: number) {
  if (!session) return;
  if (!open) {
    if (!session.escapeKeeps) return cancelSwitcher();
    session.escapeKeeps = false;
    session.busy = false;
    delete document.body.dataset.switcherMenu;
    return;
  }
  session.escapeKeeps = false;
  session.busy = true;
  document.body.dataset.switcherMenu = "";
  useSwitcherStore.setState({ index });
}

// Escape on the open menu closes only the menu and the overlay stays, as a menu's Escape does elsewhere; a second
// Escape, now with no menu, cancels the switcher. It does not look at the modifier: what a key event reports
// about it is not reliable after a click made with it held (the Mac turns that click into a secondary one), and
// with the modifier up the overlay is simply left for Enter, a click or Escape, like a binding with no modifier.
export function escapeMenuSwitcher() {
  if (session) session.escapeKeeps = true;
}

function gridColumns(): number {
  const grid = document.querySelector("[data-tab-switcher-grid]");
  if (!grid) return 1;
  return getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
}

function moveRow(direction: 1 | -1) {
  const { entries, index } = useSwitcherStore.getState();
  useSwitcherStore.setState({ index: rowIndex(index, entries.length, gridColumns(), direction) });
  reveal();
}

const jumpTarget = (e: KeyboardEvent) => digitIndex(e.code, useSwitcherStore.getState().entries.length);

// Tab itself is not handled here: it is the shortcut that opened the switcher and the global listener
// owns it. W closes the highlighted tab on its own, with whatever modifier is held, as Q quits an app in
// the macOS switcher, and the letter of the hibernate shortcut puts it to sleep or wakes it the same way;
// every shortcut is blocked meanwhile, so Cmd+W and Cmd+Alt+Z have no other meaning here. Everything else
// is swallowed so no key reaches the terminal behind the overlay.
function onKeyDown(e: KeyboardEvent) {
  if (!session || session.busy || e.key === "Tab") return;
  e.preventDefault();
  e.stopPropagation();
  const jump = jumpTarget(e);
  if (jump !== null) return commitSwitcher(jump);
  if (e.key === "Escape") cancelSwitcher();
  else if (e.key === "Enter") commitSwitcher();
  else if (e.key === "ArrowRight") stepSwitcher(1);
  else if (e.key === "ArrowLeft") stepSwitcher(-1);
  else if (e.key === "ArrowDown") moveRow(1);
  else if (e.key === "ArrowUp") moveRow(-1);
  else if (e.key.toLowerCase() === "w") void closeSelected();
  else if (session.hooks.sleepKey && e.key.toLowerCase() === session.hooks.sleepKey) void sleepSelected();
}

// The system menu (Reload, Inspect) never belongs over the overlay, with Ctrl held or not. It listens in the
// bubble phase on purpose: the tile's own menu opens from the same event and must see it unprevented first.
function onContextMenu(e: MouseEvent) {
  e.preventDefault();
}

// A binding with no modifier has nothing to release, so it can only be confirmed with Enter or a click.
const holdsModifier = (h: Held) => h.ctrl || h.alt || h.meta;

function onKeyUp(e: KeyboardEvent) {
  if (session && !session.busy && holdsModifier(session.held) && modifiersReleased(session.held, e)) {
    commitSwitcher();
  }
}

export function openSwitcher(
  e: KeyboardEvent,
  delta: 1 | -1,
  entries: TabEntry[],
  onCommit: (entry: TabEntry) => void,
  hooks: SwitcherHooks = {},
) {
  if (session || entries.length < 2) return;
  const held = heldModifiers(e);
  session = { held, onCommit, hooks, timer: null, pointer: null, busy: false, escapeKeeps: false };
  useSwitcherStore.setState({
    keys: { close: !!hooks.onClose, sleep: hooks.onSleep ? (hooks.sleepKey ?? null) : null },
    revealed: false,
    entries,
    index: startIndex(entries.length, delta),
  });
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", cancelSwitcher);
  window.addEventListener("contextmenu", onContextMenu);
  if (holdsModifier(held)) session.timer = setTimeout(reveal, REVEAL_DELAY_MS);
  else reveal();
}
