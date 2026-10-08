import type { Tab } from "./types";

// Blank title or note clears the field instead of storing an empty string.
export function applyTabEdit<T extends Tab>(
  tab: T,
  edit: { title: string; note: string },
): T {
  const title = edit.title.trim();
  const note = edit.note.trim();
  const next = { ...tab, title: title || undefined, note: note || undefined };
  if (!next.title) delete next.title;
  if (!next.note) {
    delete next.note;
    delete next.notePinned;
    delete next.notePos;
  }
  return next;
}

export function pinTabNote<T extends Tab>(tab: T): T {
  if (!tab.note) return tab;
  const next = { ...tab, notePinned: true };
  delete next.notePos;
  return next;
}

export function unpinTabNote<T extends Tab>(tab: T): T {
  const next = { ...tab };
  delete next.notePinned;
  delete next.notePos;
  return next;
}

export function moveTabNote<T extends Tab>(
  tab: T,
  pos: { x: number; y: number },
): T {
  if (!tab.notePinned) return tab;
  return { ...tab, notePos: { x: Math.round(pos.x), y: Math.round(pos.y) } };
}
