import { describe, expect, test } from "vitest";
import { applyTabEdit } from "./tabNote";
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
});
