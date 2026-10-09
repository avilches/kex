import type { Tab } from "./types";

export function hasTabNote(tab: Tab): boolean {
  return tab.note !== undefined;
}

export function isTabNoteOpen(tab: Tab): boolean {
  return tab.note !== undefined && !!tab.noteOpen;
}

function withoutNote<T extends Tab>(tab: T): T {
  const next = { ...tab };
  delete next.note;
  delete next.noteOpen;
  delete next.notePos;
  return next;
}

// Creates an empty open note, reopens a hidden one, or hides an open one.
// Hiding a blank note drops it, so toggling twice on a fresh tab leaves no trace.
export function toggleTabNote<T extends Tab>(tab: T): T {
  if (tab.note === undefined) return { ...tab, note: "", noteOpen: true };
  if (!tab.noteOpen) return { ...tab, noteOpen: true };
  return hideTabNote(tab);
}

// Hides an open note; a blank one is dropped instead of kept as an invisible leftover.
export function hideTabNote<T extends Tab>(tab: T): T {
  if (tab.note === undefined || !tab.noteOpen) return tab;
  if (!tab.note.trim()) return withoutNote(tab);
  const next = { ...tab };
  delete next.noteOpen;
  return next;
}

// An empty note that lost focus has nothing worth keeping.
export function dropBlankTabNote<T extends Tab>(tab: T): T {
  if (tab.note === undefined || tab.note.trim()) return tab;
  return withoutNote(tab);
}

export function setTabNoteText<T extends Tab>(tab: T, text: string): T {
  if (tab.note === undefined) return tab;
  return { ...tab, note: text };
}

export function removeTabNote<T extends Tab>(tab: T): T {
  return withoutNote(tab);
}

// Dragging a note makes it sticky: moving a hover preview opens it for good.
export function moveTabNote<T extends Tab>(tab: T, pos: { x: number; y: number }): T {
  if (tab.note === undefined) return tab;
  return { ...tab, noteOpen: true, notePos: { x: Math.round(pos.x), y: Math.round(pos.y) } };
}
