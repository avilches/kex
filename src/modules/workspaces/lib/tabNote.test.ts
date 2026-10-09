import { describe, expect, test } from "vitest";
import {
  hasTabNote,
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

  test("is a no-op for a hidden note", () => {
    const hidden: Tab = { ...plain, note: "text" };
    expect(moveTabNote(hidden, { x: 1, y: 2 })).toBe(hidden);
  });
});
