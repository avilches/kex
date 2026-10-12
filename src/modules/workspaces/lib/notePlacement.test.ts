import { describe, expect, test } from "vitest";
import { clampNotePos, clampNoteSize, MIN_NOTE_SIZE, dockedNotePos, resolveNotePos } from "./notePlacement";

const pane = { left: 100, top: 50, width: 800, height: 600 };
const note = { width: 300, height: 200 };

describe("clampNotePos", () => {
  const size = { width: 800, height: 600 };
  test("keeps an inside position", () => {
    expect(clampNotePos({ x: 10, y: 20 }, size, note)).toEqual({ x: 10, y: 20 });
  });
  test("clamps left and top", () => {
    expect(clampNotePos({ x: -5, y: -9 }, size, note)).toEqual({ x: 0, y: 0 });
  });
  test("clamps right and bottom", () => {
    expect(clampNotePos({ x: 700, y: 500 }, size, note)).toEqual({ x: 500, y: 400 });
  });
  test("minY raises the top limit, and a note taller than the pane pins to it", () => {
    expect(clampNotePos({ x: 0, y: 3 }, size, note, 30)).toEqual({ x: 0, y: 30 });
    expect(clampNotePos({ x: 0, y: 90 }, { width: 800, height: 100 }, note, 30)).toEqual({ x: 0, y: 30 });
  });
  test("a note larger than the pane pins to 0", () => {
    expect(
      clampNotePos({ x: 50, y: 50 }, { width: 100, height: 100 }, note),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("dockedNotePos", () => {
  test("aligns with the tab, right under the tab bar", () => {
    const tab = { left: 220, top: 55, width: 100, height: 30 };
    expect(dockedNotePos(tab, pane, note, 36)).toEqual({ x: 120, y: 36 });
  });
  test("shifts left near the right edge", () => {
    const tab = { left: 850, top: 55, width: 40, height: 30 };
    expect(dockedNotePos(tab, pane, note, 36)).toEqual({ x: 500, y: 36 });
  });
});

describe("resolveNotePos", () => {
  const tab = { left: 220, top: 55, width: 100, height: 30 };
  test("uses notePos clamped", () => {
    expect(
      resolveNotePos({ notePos: { x: 9999, y: 5 }, tab, pane, note, tabBarHeight: 36 }),
    ).toEqual({ x: 500, y: 36 });
  });
  test("never lets a stored position cover the tab bar", () => {
    expect(
      resolveNotePos({ notePos: { x: 10, y: 0 }, tab, pane, note, tabBarHeight: 36 }),
    ).toEqual({ x: 10, y: 36 });
  });
  test("docks under the tab without notePos", () => {
    expect(resolveNotePos({ tab, pane, note, tabBarHeight: 36 })).toEqual({
      x: 120,
      y: 36,
    });
  });
  test("docks at x=0 when the tab rect is unknown", () => {
    expect(resolveNotePos({ tab: null, pane, note, tabBarHeight: 36 })).toEqual({
      x: 0,
      y: 36,
    });
  });
});

describe("clampNoteSize", () => {
  const size = { width: 800, height: 600 };
  test("keeps a size that fits", () => {
    expect(clampNoteSize({ width: 300, height: 200 }, size, { x: 10, y: 10 })).toEqual({ width: 300, height: 200 });
  });
  test("never goes below the minimum", () => {
    expect(clampNoteSize({ width: 1, height: 1 }, size, { x: 0, y: 0 })).toEqual(MIN_NOTE_SIZE);
  });
  test("stops at the pane's right and bottom edges", () => {
    expect(clampNoteSize({ width: 5000, height: 5000 }, size, { x: 100, y: 50 })).toEqual({ width: 700, height: 550 });
  });
});
