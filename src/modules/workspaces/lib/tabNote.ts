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
  if (!next.note) delete next.note;
  return next;
}
