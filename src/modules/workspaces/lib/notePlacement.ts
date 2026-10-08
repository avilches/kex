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

export function dockedNotePos(
  tab: Rect,
  pane: Rect,
  note: Size,
  tabBarHeight: number,
): Point {
  return clampNotePos({ x: tab.left - pane.left, y: tabBarHeight }, pane, note, tabBarHeight);
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
