import { describe, expect, test } from "vitest";
import {
  dropBlankTabNote,
  hasTabNote,
  hideTabNote,
  isTabNoteOpen,
  moveTabNote,
  removeTabNote,
  setTabNoteText,
  toggleTabNote,
} from "./tabNote";
import type { Tab } from "./types";

const plain: Tab = { id: "tab-1", kind: "terminal", title: "build" };
const open: Tab = { ...plain, note: "text", noteOpen: true, notePos: { x: 3, y: 4 } };

describe("toggleTabNote", () => {
  test("creates an empty open note on a tab without one", () => {
    const next = toggleTabNote(plain);
    expect(next).toMatchObject({ note: "", noteOpen: true, title: "build" });
    expect(isTabNoteOpen(next)).toBe(true);
  });

  test("shows a hidden note", () => {
    const next = toggleTabNote({ ...plain, note: "text" });
    expect(next).toMatchObject({ note: "text", noteOpen: true });
  });

  test("hides an open note but keeps its text and position", () => {
    const next = toggleTabNote(open);
    expect(next.noteOpen).toBeUndefined();
    expect(next).toMatchObject({ note: "text", notePos: { x: 3, y: 4 } });
    expect(hasTabNote(next)).toBe(true);
  });

  test("hiding a blank note removes note, noteOpen and notePos", () => {
    const next = toggleTabNote({ ...open, note: "  \n " });
    expect("note" in next).toBe(false);
    expect("noteOpen" in next).toBe(false);
    expect("notePos" in next).toBe(false);
  });

  test("does not mutate the input", () => {
    toggleTabNote(open);
    expect(open.noteOpen).toBe(true);
  });
});

describe("setTabNoteText", () => {
  test("stores the text untrimmed", () => {
    expect(setTabNoteText(open, "a \n").note).toBe("a \n");
  });

  test("is a no-op without a note", () => {
    expect(setTabNoteText(plain, "x")).toBe(plain);
  });
});

describe("removeTabNote", () => {
  test("drops all three fields and keeps the rest", () => {
    const next = removeTabNote({ ...open, locked: true });
    expect(next).toEqual({ ...plain, locked: true });
  });
});

describe("moveTabNote", () => {
  test("stores a rounded position on an open note", () => {
    expect(moveTabNote(open, { x: 10.4, y: 20.6 }).notePos).toEqual({ x: 10, y: 21 });
  });

  test("makes a hidden note sticky when it is dragged", () => {
    const hidden: Tab = { ...plain, note: "text" };
    expect(moveTabNote(hidden, { x: 1, y: 2 })).toMatchObject({ noteOpen: true, notePos: { x: 1, y: 2 } });
  });

  test("is a no-op for a tab without a note", () => {
    expect(moveTabNote(plain, { x: 1, y: 2 })).toBe(plain);
  });
});

describe("hideTabNote", () => {
  test("keeps the text of a non-blank note and clears only noteOpen", () => {
    const next = hideTabNote(open);
    expect(next.note).toBe("text");
    expect(next.noteOpen).toBeUndefined();
    expect(next.notePos).toEqual({ x: 3, y: 4 });
  });

  test("drops a blank open note entirely", () => {
    const next = hideTabNote({ ...open, note: "  " });
    expect(next).toEqual(plain);
  });

  test("leaves a hidden or missing note untouched", () => {
    expect(hideTabNote(plain)).toBe(plain);
    const hidden: Tab = { ...plain, note: "x" };
    expect(hideTabNote(hidden)).toBe(hidden);
  });
});

describe("dropBlankTabNote", () => {
  test("drops a blank note whether open or hidden", () => {
    expect(dropBlankTabNote({ ...open, note: "" })).toEqual(plain);
    expect(dropBlankTabNote({ ...plain, note: " \n" })).toEqual(plain);
  });

  test("keeps a note with text and a tab without a note", () => {
    expect(dropBlankTabNote(open)).toBe(open);
    expect(dropBlankTabNote(plain)).toBe(plain);
  });
});
