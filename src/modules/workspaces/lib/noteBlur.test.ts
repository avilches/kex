// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { isLeavingNote } from "./noteBlur";

describe("isLeavingNote", () => {
  const container = document.createElement("div");
  const inside = document.createElement("button");
  container.append(inside);
  const outside = document.createElement("button");
  const base = { container, pointerDownInside: false, documentHasFocus: true };

  it("leaves when focus moves to an element outside the note", () => {
    expect(isLeavingNote({ ...base, relatedTarget: outside })).toBe(true);
  });

  it("stays when focus moves within the note", () => {
    expect(isLeavingNote({ ...base, relatedTarget: inside })).toBe(false);
  });

  it("stays on a click in a non-focusable area of the note", () => {
    expect(isLeavingNote({ ...base, relatedTarget: null, pointerDownInside: true })).toBe(false);
  });

  it("stays when the window itself lost focus", () => {
    expect(isLeavingNote({ ...base, relatedTarget: null, documentHasFocus: false })).toBe(false);
  });

  it("leaves when focus goes nowhere because of a click outside", () => {
    expect(isLeavingNote({ ...base, relatedTarget: null })).toBe(true);
  });
});
