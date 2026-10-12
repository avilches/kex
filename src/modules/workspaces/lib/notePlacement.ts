export type Size = { width: number; height: number };
export type Rect = { left: number; top: number; width: number; height: number };
export type Point = { x: number; y: number };

// minY keeps the note below the tab bar so it never covers the tabs.
export function clampNotePos(pos: Point, pane: Size, note: Size, minY = 0): Point {
  const maxX = Math.max(0, pane.width - note.width);
  const maxY = Math.max(minY, pane.height - note.height);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(minY, pos.y), maxY),
  };
}

export const MIN_NOTE_SIZE: Size = { width: 160, height: 72 };

// The note keeps its top-left corner, so it can only grow up to the pane's right and bottom edges.
export function clampNoteSize(size: Size, pane: Size, pos: Point): Size {
  const maxW = Math.max(MIN_NOTE_SIZE.width, pane.width - pos.x);
  const maxH = Math.max(MIN_NOTE_SIZE.height, pane.height - pos.y);
  return {
    width: Math.min(Math.max(MIN_NOTE_SIZE.width, size.width), maxW),
    height: Math.min(Math.max(MIN_NOTE_SIZE.height, size.height), maxH),
  };
}

export function dockedNotePos(
  tab: Rect,
  pane: Rect,
  note: Size,
  tabBarHeight: number,
): Point {
  return clampNotePos({ x: tab.left - pane.left, y: tabBarHeight }, pane, note, tabBarHeight);
}

// Docked to the right of a WorkspaceBar row, top-aligned with it.
export function sideRowNotePos(row: Rect, pane: Rect, note: Size, gap = 4): Point {
  return clampNotePos({ x: row.left + row.width - pane.left + gap, y: row.top - pane.top }, pane, note);
}

export function resolveNotePos(args: {
  notePos?: Point;
  tab: Rect | null;
  pane: Rect;
  note: Size;
  tabBarHeight: number;
}): Point {
  const { notePos, tab, pane, note, tabBarHeight } = args;
  if (notePos) return clampNotePos(notePos, pane, note, tabBarHeight);
  if (tab) return dockedNotePos(tab, pane, note, tabBarHeight);
  return clampNotePos({ x: 0, y: tabBarHeight }, pane, note, tabBarHeight);
}
