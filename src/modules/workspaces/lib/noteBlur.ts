export type NoteBlurInput = {
  // Where focus is going; null when it goes nowhere focusable.
  relatedTarget: EventTarget | null;
  container: Node;
  // A pointer press landed inside the note just before this blur.
  pointerDownInside: boolean;
  documentHasFocus: boolean;
};

// A blur only means the user left the note when focus moves to something outside
// it. Focus going nowhere (relatedTarget null) is also what a click on a
// non-focusable part of the note and a window blur (alt-tab) look like, and
// neither of those leaves the note.
export function isLeavingNote(input: NoteBlurInput): boolean {
  const { relatedTarget, container, pointerDownInside, documentHasFocus } = input;
  if (relatedTarget instanceof Node) return !container.contains(relatedTarget);
  if (pointerDownInside) return false;
  return documentHasFocus;
}
