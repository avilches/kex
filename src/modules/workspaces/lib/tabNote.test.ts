import { describe, expect, test } from "vitest";
import { applyTabEdit, moveTabNote, pinTabNote, unpinTabNote } from "./tabNote";
import type { Tab } from "./types";

const terminal: Tab = { id: "tab-1", kind: "terminal", title: "old", note: "old note" };

describe("applyTabEdit", () => {
  test("sets title and note, trimmed", () => {
    const next = applyTabEdit(terminal, { title: "  build  ", note: "\n- a\n- b\n" });
    expect(next).toMatchObject({ title: "build", note: "- a\n- b" });
  });

  test("a blank note removes the field", () => {
    const next = applyTabEdit(terminal, { title: "build", note: "   \n " });
    expect("note" in next).toBe(false);
  });

  test("a blank title removes the field and keeps the note", () => {
    const next = applyTabEdit(terminal, { title: "", note: "keep" });
    expect("title" in next).toBe(false);
    expect(next.note).toBe("keep");
  });

  test("keeps the rest of the tab untouched", () => {
    const next = applyTabEdit({ ...terminal, locked: true }, { title: "t", note: "n" });
    expect(next).toMatchObject({ id: "tab-1", kind: "terminal", locked: true });
  });

  test("does not mutate the input", () => {
    applyTabEdit(terminal, { title: "", note: "" });
    expect(terminal).toMatchObject({ title: "old", note: "old note" });
  });

  test("a blank note also clears the pin and its position", () => {
    const pinned: Tab = { ...terminal, notePinned: true, notePos: { x: 1, y: 2 } };
    const next = applyTabEdit(pinned, { title: "t", note: " " });
    expect("notePinned" in next).toBe(false);
    expect("notePos" in next).toBe(false);
  });

  test("a non-blank note keeps the pin", () => {
    const pinned: Tab = { ...terminal, notePinned: true, notePos: { x: 1, y: 2 } };
    const next = applyTabEdit(pinned, { title: "t", note: "n" });
    expect(next).toMatchObject({ notePinned: true, notePos: { x: 1, y: 2 } });
  });
});

describe("pinTabNote", () => {
  test("pins and docks, dropping notePos", () => {
    const next = pinTabNote({ ...terminal, notePos: { x: 5, y: 5 } });
    expect(next.notePinned).toBe(true);
    expect("notePos" in next).toBe(false);
  });
  test("no-op without a note", () => {
    const bare: Tab = { id: "tab-2", kind: "terminal" };
    expect(pinTabNote(bare)).toBe(bare);
  });
});

describe("unpinTabNote", () => {
  test("removes pin and position, keeps the note", () => {
    const next = unpinTabNote({ ...terminal, notePinned: true, notePos: { x: 1, y: 1 } });
    expect("notePinned" in next).toBe(false);
    expect("notePos" in next).toBe(false);
    expect(next.note).toBe("old note");
  });
});

describe("moveTabNote", () => {
  test("sets a rounded position when pinned", () => {
    const next = moveTabNote({ ...terminal, notePinned: true }, { x: 10.4, y: 20.6 });
    expect(next.notePos).toEqual({ x: 10, y: 21 });
  });
  test("no-op when not pinned", () => {
    expect(moveTabNote(terminal, { x: 1, y: 1 })).toBe(terminal);
  });
  test("does not mutate the input", () => {
    const pinned: Tab = { ...terminal, notePinned: true };
    moveTabNote(pinned, { x: 1, y: 1 });
    expect("notePos" in pinned).toBe(false);
  });
});
