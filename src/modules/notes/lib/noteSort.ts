import type { NoteSortMode } from "./notesConfig";
import type { NoteListItem } from "./notesList";

export function filterByFolder(notes: NoteListItem[], folder: string): NoteListItem[] {
  if (folder === "") return notes;
  return notes.filter((n) => n.folder === folder || n.folder.startsWith(`${folder}/`));
}

export function sortNotes(
  notes: NoteListItem[],
  mode: NoteSortMode,
  noteOrder: Record<string, number>,
): NoteListItem[] {
  const copy = [...notes];
  switch (mode) {
    case "title":
      copy.sort(
        (a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
          a.relPath.localeCompare(b.relPath),
      );
      break;
    case "created":
      copy.sort((a, b) => b.created - a.created || a.relPath.localeCompare(b.relPath));
      break;
    case "custom":
      copy.sort((a, b) => {
        const ia = noteOrder[a.relPath];
        const ib = noteOrder[b.relPath];
        if (ia !== undefined && ib !== undefined) return ia - ib;
        if (ia !== undefined) return -1;
        if (ib !== undefined) return 1;
        return b.mtime - a.mtime;
      });
      break;
    default:
      copy.sort((a, b) => b.mtime - a.mtime || a.relPath.localeCompare(b.relPath));
  }
  return copy;
}

export type DateBucket = "Today" | "Yesterday" | "This Week" | "This Month" | "Older";
export type NoteGroup = { bucket: DateBucket; notes: NoteListItem[] };

const DAY_MS = 86_400_000;

export function groupNotesByDate(
  sorted: NoteListItem[],
  mode: "modified" | "created",
  now: number,
): NoteGroup[] {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const today = d.getTime();
  const bucketOf = (ts: number): DateBucket => {
    if (ts >= today) return "Today";
    if (ts >= today - DAY_MS) return "Yesterday";
    if (ts >= today - 6 * DAY_MS) return "This Week";
    if (ts >= today - 29 * DAY_MS) return "This Month";
    return "Older";
  };
  const groups: NoteGroup[] = [];
  for (const note of sorted) {
    const bucket = bucketOf(mode === "created" ? note.created : note.mtime);
    const last = groups[groups.length - 1];
    if (last && last.bucket === bucket) last.notes.push(note);
    else groups.push({ bucket, notes: [note] });
  }
  return groups;
}

export function formatRelativeDate(ts: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - ts) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

export function nextUntitledName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has("untitled.md")) return "Untitled.md";
  for (let i = 2; ; i++) {
    const candidate = `Untitled ${i}.md`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
