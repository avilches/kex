import { describe, expect, it } from "vitest";
import {
  GRID_GAP,
  GRID_PAD,
  TILE_HEIGHT,
  gridViewportHeight,
  heldModifiers,
  modifiersReleased,
  pointerMoved,
  rowIndex,
  startIndex,
  stepIndex,
  switcherOrder,
} from "./switcherModel";

const e = (o: Partial<Record<"ctrlKey" | "altKey" | "metaKey", boolean>>) => ({
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...o,
});
const entry = (tabId: string, lastUsedAt: number, order = 0) => ({ tabId, lastUsedAt, order });

describe("switcherOrder", () => {
  it("sorts by recency and falls back to tree order", () => {
    const out = switcherOrder([entry("a", 1, 0), entry("b", 5, 1), entry("c", 5, 2), entry("d", 0, 3)], null);
    expect(out.map((x) => x.tabId)).toEqual(["b", "c", "a", "d"]);
  });

  it("puts the active tab first even when it is not the newest", () => {
    const out = switcherOrder([entry("a", 9), entry("b", 5), entry("c", 1)], "c");
    expect(out.map((x) => x.tabId)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate its input and ignores an unknown active tab", () => {
    const input = [entry("a", 1), entry("b", 2)];
    expect(switcherOrder(input, "zzz").map((x) => x.tabId)).toEqual(["b", "a"]);
    expect(input.map((x) => x.tabId)).toEqual(["a", "b"]);
  });
});

describe("startIndex", () => {
  it("lands on the previous tab going forward and on the oldest going back", () => {
    expect(startIndex(5, 1)).toBe(1);
    expect(startIndex(5, -1)).toBe(4);
  });
  it("stays on 0 with one tab or none", () => {
    expect(startIndex(1, 1)).toBe(0);
    expect(startIndex(0, -1)).toBe(0);
  });
});

describe("stepIndex", () => {
  it("wraps both ways", () => {
    expect(stepIndex(4, 5, 1)).toBe(0);
    expect(stepIndex(0, 5, -1)).toBe(4);
    expect(stepIndex(2, 5, 1)).toBe(3);
  });
  it("is safe with no entries", () => {
    expect(stepIndex(0, 0, 1)).toBe(0);
  });
});

describe("rowIndex", () => {
  it("moves a row and clamps at the ends", () => {
    expect(rowIndex(1, 20, 6, 1)).toBe(7);
    expect(rowIndex(15, 20, 6, 1)).toBe(19);
    expect(rowIndex(3, 20, 6, -1)).toBe(0);
  });
  it("treats a zero column count as one", () => {
    expect(rowIndex(2, 10, 0, 1)).toBe(3);
  });
});

describe("gridViewportHeight", () => {
  const row = TILE_HEIGHT + GRID_GAP;

  it("shows whole rows only: the scroller is the rows that fit, with no padding of its own", () => {
    expect(gridViewportHeight(3.5 * row + 2 * GRID_PAD, 6)).toBe(3 * TILE_HEIGHT + 2 * GRID_GAP);
  });

  it("leaves the height to the content when every row fits, so a short list has no scroll", () => {
    expect(gridViewportHeight(5 * row, 4)).toBeNull();
    expect(gridViewportHeight(4 * row + 2 * GRID_PAD - GRID_GAP, 4)).toBeNull();
  });

  it("never shows less than one row, however small the window", () => {
    expect(gridViewportHeight(10, 5)).toBe(TILE_HEIGHT);
    expect(gridViewportHeight(-50, 5)).toBe(TILE_HEIGHT);
  });

  it("is a whole number of rows for any space, so no row is ever cut at the bottom", () => {
    for (let avail = 150; avail < 700; avail += 7) {
      const h = gridViewportHeight(avail, 40);
      expect(h).not.toBeNull();
      expect((h! + GRID_GAP) % row).toBe(0);
    }
  });

  it("never asks for more than the space it was given, unless one row alone needs more", () => {
    for (let avail = 150; avail < 700; avail += 7) {
      const h = gridViewportHeight(avail, 40)!;
      expect(h <= avail - 2 * GRID_PAD || h === TILE_HEIGHT).toBe(true);
    }
  });
});

describe("pointerMoved", () => {
  it("never counts the first sample, which only sets the reference", () => {
    expect(pointerMoved(null, { x: 10, y: 10 })).toBe(false);
  });
  it("ignores a jitter below the slop and counts a real shift", () => {
    expect(pointerMoved({ x: 10, y: 10 }, { x: 12, y: 11 })).toBe(false);
    expect(pointerMoved({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
    expect(pointerMoved({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true);
  });
});

describe("modifiers", () => {
  it("commits only when every held modifier is up", () => {
    const held = heldModifiers(e({ ctrlKey: true, altKey: true }));
    expect(modifiersReleased(held, e({ ctrlKey: true }))).toBe(false);
    expect(modifiersReleased(held, e({ altKey: true }))).toBe(false);
    expect(modifiersReleased(held, e({}))).toBe(true);
  });
  it("ignores a modifier that was not part of the opening chord", () => {
    const held = heldModifiers(e({ ctrlKey: true }));
    expect(modifiersReleased(held, e({ metaKey: true }))).toBe(true);
  });
});
