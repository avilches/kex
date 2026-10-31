import { create } from "zustand";
import type { TabEntry } from "@/modules/command-palette";
import {
  REVEAL_DELAY_MS,
  afterRemoval,
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
  // Painted only after REVEAL_DELAY_MS, or at once on a second step: a tap never flashes the overlay.
  revealed: boolean;
  entries: TabEntry[];
  index: number;
};

export const useSwitcherStore = create<SwitcherState>(() => ({ revealed: false, entries: [], index: 0 }));

// What the app does to close a tab: nothing returned means it refused (a locked tab), otherwise whether
// the tab really went, since a confirmation may have been cancelled.
export type CloseTab = (entry: TabEntry) => Promise<boolean> | undefined;

type Session = {
  held: Held;
  onCommit: (entry: TabEntry) => void;
  onClose: CloseTab | null;
  timer: ReturnType<typeof setTimeout> | null;
  pointer: Point | null;
  // A close is waiting on the host, which may be asking the user to confirm it: the keys belong to that
  // dialog meanwhile, and letting go of the modifier must not commit a jump behind it.
  closing: boolean;
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
  useSwitcherStore.setState({ revealed: false, entries: [], index: 0 });
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
  if (!session) return;
  const { entries, index } = useSwitcherStore.getState();
  useSwitcherStore.setState({ index: stepIndex(index, entries.length, delta) });
  reveal();
}

// Closes the highlighted tab through the host given when it opened, which does what the rest of the app does (a locked tab refuses,
// an unsaved document asks) and says whether the tab is really gone. Only then does its tile leave, so a
// cancelled confirmation leaves everything as it was. The host returns nothing to refuse without closing.
async function closeSelected(): Promise<void> {
  const current = session;
  if (!current || current.closing) return;
  const close = current.onClose;
  if (!close) return;
  const { entries, index } = useSwitcherStore.getState();
  const entry = entries[index];
  if (!entry) return;
  current.closing = true;
  let closed = false;
  try {
    closed = (await close(entry)) === true;
  } finally {
    current.closing = false;
  }
  if (session !== current || !closed) return;
  const left = useSwitcherStore.getState();
  const next = afterRemoval(left.entries, left.index, entry.tabId);
  if (!next) return end();
  useSwitcherStore.setState(next);
}

// Fed by the tiles on every pointer move. The reference point only advances when the pointer really
// travelled, so a slow drift cannot add up to a pick, and a still cursor never picks anything.
export function hoverSwitcher(index: number, at: Point) {
  if (!session) return;
  const moved = pointerMoved(session.pointer, at);
  if (session.pointer === null || moved) session.pointer = at;
  if (moved) useSwitcherStore.setState({ index });
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

// Tab itself is not handled here: it is the shortcut that opened the switcher and the global listener
// owns it. W closes the highlighted tab on its own, with whatever modifier is held, as Q quits an app in
// the macOS switcher; every shortcut is blocked meanwhile, so Cmd+W has no other meaning here. Everything
// else is swallowed so no key reaches the terminal behind the overlay.
function onKeyDown(e: KeyboardEvent) {
  if (!session || session.closing || e.key === "Tab") return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") cancelSwitcher();
  else if (e.key === "Enter") commitSwitcher();
  else if (e.key === "ArrowRight") stepSwitcher(1);
  else if (e.key === "ArrowLeft") stepSwitcher(-1);
  else if (e.key === "ArrowDown") moveRow(1);
  else if (e.key === "ArrowUp") moveRow(-1);
  else if (e.key.toLowerCase() === "w") void closeSelected();
}

// A binding with no modifier has nothing to release, so it can only be confirmed with Enter or a click.
const holdsModifier = (h: Held) => h.ctrl || h.alt || h.meta;

function onKeyUp(e: KeyboardEvent) {
  if (session && !session.closing && holdsModifier(session.held) && modifiersReleased(session.held, e)) {
    commitSwitcher();
  }
}

export function openSwitcher(
  e: KeyboardEvent,
  delta: 1 | -1,
  entries: TabEntry[],
  onCommit: (entry: TabEntry) => void,
  onClose?: CloseTab,
) {
  if (session || entries.length < 2) return;
  const held = heldModifiers(e);
  session = { held, onCommit, onClose: onClose ?? null, timer: null, pointer: null, closing: false };
  useSwitcherStore.setState({ revealed: false, entries, index: startIndex(entries.length, delta) });
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", cancelSwitcher);
  if (holdsModifier(held)) session.timer = setTimeout(reveal, REVEAL_DELAY_MS);
  else reveal();
}
