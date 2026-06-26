import { describe, expect, it } from "vitest";
import {
  clampToStep,
  CURSOR_INACTIVE_STYLE_DEFAULT,
  CURSOR_STYLE_DEFAULT,
  LETTER_SPACING_MIN,
  LETTER_SPACING_MAX,
  LETTER_SPACING_STEP,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
  parseCursorInactiveStyle,
  parseCursorStyle,
  parseScmViewMode,
  parseTerminalNewFolderMode,
  DEFAULT_PREFERENCES,
} from "./store";

describe("clampToStep", () => {
  it("snaps to the nearest step", () => {
    expect(clampToStep(14.3, 8, 18, 0.5, 14)).toBe(14.5);
    expect(clampToStep(14.1, 8, 18, 0.5, 14)).toBe(14);
  });

  it("clamps below min and above max", () => {
    expect(clampToStep(-99, LETTER_SPACING_MIN, LETTER_SPACING_MAX, LETTER_SPACING_STEP, 0)).toBe(
      LETTER_SPACING_MIN,
    );
    expect(clampToStep(99, LETTER_SPACING_MIN, LETTER_SPACING_MAX, LETTER_SPACING_STEP, 0)).toBe(
      LETTER_SPACING_MAX,
    );
  });

  it("strips binary float drift", () => {
    // 0.1 * 12 = 1.2000000000000002 without the rounding guard.
    expect(clampToStep(1.2, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, LINE_HEIGHT_STEP, 1)).toBe(1.2);
    expect(clampToStep(1.25, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, LINE_HEIGHT_STEP, 1)).toBe(1.3);
  });

  it("falls back when the value is not finite", () => {
    expect(clampToStep(Number.NaN, 8, 18, 0.5, 14)).toBe(14);
    expect(clampToStep(Number.POSITIVE_INFINITY, 8, 18, 0.5, 13)).toBe(13);
  });
});

describe("parseCursorStyle", () => {
  it("accepts the three valid xterm styles", () => {
    expect(parseCursorStyle("bar")).toBe("bar");
    expect(parseCursorStyle("block")).toBe("block");
    expect(parseCursorStyle("underline")).toBe("underline");
  });

  it("falls back to the default for anything else", () => {
    expect(CURSOR_STYLE_DEFAULT).toBe("bar");
    expect(parseCursorStyle("outline")).toBe(CURSOR_STYLE_DEFAULT);
    expect(parseCursorStyle("BAR")).toBe(CURSOR_STYLE_DEFAULT);
    expect(parseCursorStyle(undefined)).toBe(CURSOR_STYLE_DEFAULT);
    expect(parseCursorStyle(42)).toBe(CURSOR_STYLE_DEFAULT);
  });
});

describe("parseCursorInactiveStyle", () => {
  it("accepts every valid xterm inactive style", () => {
    for (const s of ["outline", "block", "bar", "underline", "none"]) {
      expect(parseCursorInactiveStyle(s)).toBe(s);
    }
  });

  it("falls back to the default for anything else", () => {
    expect(CURSOR_INACTIVE_STYLE_DEFAULT).toBe("outline");
    expect(parseCursorInactiveStyle("dotted")).toBe(
      CURSOR_INACTIVE_STYLE_DEFAULT,
    );
    expect(parseCursorInactiveStyle(null)).toBe(CURSOR_INACTIVE_STYLE_DEFAULT);
  });
});

describe("terminal cursor and scroll defaults", () => {
  it("match xterm's baseline behavior", () => {
    expect(DEFAULT_PREFERENCES.terminalCursorStyle).toBe("bar");
    expect(DEFAULT_PREFERENCES.terminalCursorInactiveStyle).toBe("outline");
    expect(DEFAULT_PREFERENCES.terminalCursorWidth).toBe(1);
    expect(DEFAULT_PREFERENCES.terminalScrollSensitivity).toBe(1);
  });
});

describe("scmViewMode", () => {
  it("defaults to tree", () => {
    expect(DEFAULT_PREFERENCES.scmViewMode).toBe("tree");
  });

  it("parses only the exact 'list' string as list", () => {
    expect(parseScmViewMode("tree")).toBe("tree");
    expect(parseScmViewMode("list")).toBe("list");
    expect(parseScmViewMode("LIST")).toBe("tree");
    expect(parseScmViewMode(undefined)).toBe("tree");
    expect(parseScmViewMode(null)).toBe("tree");
    expect(parseScmViewMode(42)).toBe("tree");
  });
});

describe("terminalNewFolderMode", () => {
  it("defaults to context", () => {
    expect(DEFAULT_PREFERENCES.terminalNewFolderMode).toBe("context");
  });

  it("parses all three valid modes and falls back to context", () => {
    expect(parseTerminalNewFolderMode("home")).toBe("home");
    expect(parseTerminalNewFolderMode("workspace")).toBe("workspace");
    expect(parseTerminalNewFolderMode("context")).toBe("context");
    expect(parseTerminalNewFolderMode("WORKSPACE")).toBe("context");
    expect(parseTerminalNewFolderMode(undefined)).toBe("context");
    expect(parseTerminalNewFolderMode(null)).toBe("context");
    expect(parseTerminalNewFolderMode(42)).toBe("context");
  });
});

describe("editorViewByExt default", () => {
  it("defaults to an empty map", () => {
    expect(DEFAULT_PREFERENCES.editorViewByExt).toEqual({});
  });
});

describe("DEFAULT_PREFERENCES", () => {
  it("scratchpadEnterSends defaults to true", () => {
    expect(DEFAULT_PREFERENCES.scratchpadEnterSends).toBe(true);
  });
});
