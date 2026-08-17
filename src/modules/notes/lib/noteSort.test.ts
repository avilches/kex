import { describe, expect, it } from "vitest";
import type { NoteListItem } from "./notesList";
import {
  filterByFolder,
  formatRelativeDate,
  groupNotesByDate,
  nextUntitledName,
  sortNotes,
} from "./noteSort";

function n(relPath: string, over: Partial<NoteListItem> = {}): NoteListItem {
  const i = relPath.lastIndexOf("/");
  return {
    path: `/vault/${relPath}`,
    relPath,
    title: relPath,
    mtime: 0,
    created: 0,
    snippet: "",
    folder: i === -1 ? "" : relPath.slice(0, i),
    ...over,
  };
}

describe("filterByFolder", () => {
  const notes = [
    n("a.md"),
    n("docs/b.md"),
    n("docs/sub/c.md"),
    n("docs/sub/deep/e.md"),
    n("docs2/d.md"),
  ];

  it("root means only the notes directly in the root", () => {
    expect(filterByFolder(notes, "").map((x) => x.relPath)).toEqual(["a.md"]);
  });

  it("matches the folder exactly, excluding its subtree and sibling prefixes", () => {
    expect(filterByFolder(notes, "docs").map((x) => x.relPath)).toEqual(["docs/b.md"]);
  });

  it("matches a nested folder", () => {
    expect(filterByFolder(notes, "docs/sub").map((x) => x.relPath)).toEqual(["docs/sub/c.md"]);
  });
});

describe("sortNotes", () => {
  const a = n("a.md", { title: "Zebra", mtime: 300, created: 100 });
  const b = n("b.md", { title: "alpha", mtime: 200, created: 300 });
  const c = n("c.md", { title: "Mango", mtime: 100, created: 200 });

  it("modified: mtime desc", () => {
    expect(sortNotes([c, a, b], "modified", undefined).map((x) => x.relPath)).toEqual([
      "a.md", "b.md", "c.md",
    ]);
  });
  it("title: case-insensitive asc", () => {
    expect(sortNotes([a, b, c], "title", undefined).map((x) => x.title)).toEqual([
      "alpha", "Mango", "Zebra",
    ]);
  });
  it("created: created desc", () => {
    expect(sortNotes([a, b, c], "created", undefined).map((x) => x.relPath)).toEqual([
      "b.md", "c.md", "a.md",
    ]);
  });
  it("custom: listed names in order, unlisted after by mtime desc", () => {
    const extra = n("z.md", { mtime: 999 });
    expect(
      sortNotes([a, b, c, extra], "custom", ["c.md", "b.md"]).map((x) => x.relPath),
    ).toEqual(["c.md", "b.md", "z.md", "a.md"]);
  });
  it("custom: a folder with no list falls back to mtime desc", () => {
    expect(sortNotes([c, a, b], "custom", undefined).map((x) => x.relPath)).toEqual([
      "a.md", "b.md", "c.md",
    ]);
  });
  it("custom: matches by file name inside a nested folder", () => {
    const x = n("docs/x.md", { mtime: 10 });
    const y = n("docs/y.md", { mtime: 20 });
    expect(sortNotes([x, y], "custom", ["y.md", "x.md"]).map((x2) => x2.relPath)).toEqual([
      "docs/y.md", "docs/x.md",
    ]);
  });
  it("does not mutate the input", () => {
    const input = [a, b, c];
    sortNotes(input, "title", undefined);
    expect(input.map((x) => x.relPath)).toEqual(["a.md", "b.md", "c.md"]);
  });
});

describe("groupNotesByDate", () => {
  // Fixed local reference: 2026-07-06 15:00 local time
  const now = new Date(2026, 6, 6, 15, 0, 0).getTime();
  const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo, d, h).getTime();

  it("assigns buckets by local day distance", () => {
    const notes = [
      n("t.md", { mtime: at(2026, 6, 6) }),
      n("y.md", { mtime: at(2026, 6, 5) }),
      n("w.md", { mtime: at(2026, 6, 1) }),
      n("m.md", { mtime: at(2026, 5, 20) }),
      n("o.md", { mtime: at(2025, 0, 1) }),
    ];
    const groups = groupNotesByDate(notes, "modified", now);
    expect(groups.map((g) => g.bucket)).toEqual([
      "Today", "Yesterday", "This Week", "This Month", "Older",
    ]);
    expect(groups.map((g) => g.notes.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("keeps consecutive same-bucket notes in one group and uses created when asked", () => {
    const notes = [
      n("a.md", { created: at(2026, 6, 6, 10) }),
      n("b.md", { created: at(2026, 6, 6, 9) }),
    ];
    const groups = groupNotesByDate(notes, "created", now);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe("Today");
    expect(groups[0].notes).toHaveLength(2);
  });
});

describe("formatRelativeDate", () => {
  const now = 1_000_000_000_000;
  it("scales from now to days", () => {
    expect(formatRelativeDate(now - 30_000, now)).toBe("now");
    expect(formatRelativeDate(now - 5 * 60_000, now)).toBe("5m");
    expect(formatRelativeDate(now - 3 * 3_600_000, now)).toBe("3h");
    expect(formatRelativeDate(now - 2 * 86_400_000, now)).toBe("2d");
  });
  it("falls back to a locale date after a week", () => {
    const ts = now - 8 * 86_400_000;
    expect(formatRelativeDate(ts, now)).toBe(new Date(ts).toLocaleDateString());
  });
});

describe("nextUntitledName", () => {
  it("starts at Untitled.md and increments, case-insensitive", () => {
    expect(nextUntitledName([])).toBe("Untitled.md");
    expect(nextUntitledName(["untitled.md"])).toBe("Untitled 2.md");
    expect(nextUntitledName(["Untitled.md", "Untitled 2.md"])).toBe("Untitled 3.md");
  });
});
