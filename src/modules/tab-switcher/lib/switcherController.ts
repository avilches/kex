import { create } from "zustand";
import type { TabEntry } from "@/modules/command-palette";
import {
  REVEAL_DELAY_MS,
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

type Session = {
  held: Held;
  onCommit: (entry: TabEntry) => void;
  timer: ReturnType<typeof setTimeout> | null;
  pointer: Point | null;
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
// owns it. Everything else is swallowed so no key reaches the terminal behind the overlay.
function onKeyDown(e: KeyboardEvent) {
  if (!session || e.key === "Tab") return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") cancelSwitcher();
  else if (e.key === "Enter") commitSwitcher();
  else if (e.key === "ArrowRight") stepSwitcher(1);
  else if (e.key === "ArrowLeft") stepSwitcher(-1);
  else if (e.key === "ArrowDown") moveRow(1);
  else if (e.key === "ArrowUp") moveRow(-1);
}

// A binding with no modifier has nothing to release, so it can only be confirmed with Enter or a click.
const holdsModifier = (h: Held) => h.ctrl || h.alt || h.meta;

function onKeyUp(e: KeyboardEvent) {
  if (session && holdsModifier(session.held) && modifiersReleased(session.held, e)) commitSwitcher();
}

export function openSwitcher(
  e: KeyboardEvent,
  delta: 1 | -1,
  entries: TabEntry[],
  onCommit: (entry: TabEntry) => void,
) {
  if (session || entries.length < 2) return;
  const held = heldModifiers(e);
  session = { held, onCommit, timer: null, pointer: null };
  useSwitcherStore.setState({ revealed: false, entries, index: startIndex(entries.length, delta) });
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", cancelSwitcher);
  if (holdsModifier(held)) session.timer = setTimeout(reveal, REVEAL_DELAY_MS);
  else reveal();
}
