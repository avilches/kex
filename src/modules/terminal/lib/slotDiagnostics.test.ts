import { describe, expect, it } from "vitest";
import {
  formatPoolEvent,
  inspectTerminal,
  type InspectableTerminal,
} from "./slotDiagnostics";

function fakeTerm(opts: {
  cols?: number;
  rows?: number;
  length?: number;
  viewportY?: number;
  baseY?: number;
  missing?: number[];
  type?: string;
}): InspectableTerminal {
  const rows = opts.rows ?? 4;
  const length = opts.length ?? rows;
  const missing = new Set(opts.missing ?? []);
  return {
    cols: opts.cols ?? 80,
    rows,
    buffer: {
      active: {
        type: opts.type ?? "normal",
        length,
        viewportY: opts.viewportY ?? 0,
        baseY: opts.baseY ?? 0,
        getLine: (i: number) => (missing.has(i) || i >= length ? undefined : {}),
      },
    },
  };
}

describe("inspectTerminal", () => {
  it("reports a terminal whose viewport lines all exist as healthy", () => {
    const h = inspectTerminal(fakeTerm({}));
    expect(h.ok).toBe(true);
    expect(h.missingViewportLines).toBe(0);
    expect(h.firstMissing).toBeNull();
  });

  it("flags viewport lines that are undefined, the cause of loadCell errors", () => {
    const h = inspectTerminal(fakeTerm({ rows: 4, missing: [1, 2] }));
    expect(h.ok).toBe(false);
    expect(h.missingViewportLines).toBe(2);
    expect(h.firstMissing).toBe(1);
  });

  it("looks at the viewport window, not at the start of the scrollback", () => {
    const h = inspectTerminal(
      fakeTerm({ rows: 3, length: 10, viewportY: 7, baseY: 7, missing: [0] }),
    );
    expect(h.ok).toBe(true);
    const bad = inspectTerminal(
      fakeTerm({ rows: 3, length: 10, viewportY: 7, baseY: 7, missing: [8] }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.firstMissing).toBe(8);
  });

  it("flags a buffer shorter than the number of rows", () => {
    const h = inspectTerminal(fakeTerm({ rows: 5, length: 2 }));
    expect(h.ok).toBe(false);
    expect(h.bufferShorterThanRows).toBe(true);
  });

  it("flags non positive dimensions", () => {
    expect(inspectTerminal(fakeTerm({ cols: 0 })).ok).toBe(false);
    expect(inspectTerminal(fakeTerm({ rows: 0, length: 0 })).ok).toBe(false);
  });

  it("does not throw when the buffer access itself throws", () => {
    const term = {
      cols: 80,
      rows: 4,
      get buffer(): never {
        throw new Error("disposed");
      },
    } as unknown as InspectableTerminal;
    const h = inspectTerminal(term);
    expect(h.ok).toBe(false);
    expect(h.error).toContain("disposed");
  });
});

describe("formatPoolEvent", () => {
  it("writes the tag, the event and key=value pairs in order", () => {
    expect(formatPoolEvent("bind", { slot: 3, leaf: "tab-x", reused: true })).toBe(
      "[pool] bind slot=3 leaf=tab-x reused=true",
    );
  });

  it("skips undefined fields and writes null explicitly", () => {
    expect(formatPoolEvent("detach", { slot: 1, leaf: null, why: undefined })).toBe(
      "[pool] detach slot=1 leaf=null",
    );
  });

  it("quotes values with spaces", () => {
    expect(formatPoolEvent("x", { err: "a b" })).toBe('[pool] x err="a b"');
  });
});
