import { describe, expect, it } from "vitest";
import {
  buildReport,
  createAccumulator,
  describeCallback,
  formatReport,
  originOf,
  recordCallback,
  recordFrameGap,
} from "./rafStats";

const CENSUS = { nodes: 10, xterms: 2, domRendererTerminals: 1, webglTerminals: 1, domRows: 30 };

describe("originOf", () => {
  it("skips the wrapper frame and shortens each location", () => {
    const stack = [
      "wrapped@http://localhost:1421/src/modules/profiler/lib/profiler.ts?t=12:30:5",
      "refresh@http://localhost:1421/node_modules/.vite/deps/xterm.js?v=abc:11616:344",
      "@tauri://localhost/assets/main-00GW_4Xt.js:89:6",
    ].join("\n");
    expect(originOf("[cb]", stack)).toBe(
      "[cb] refresh@deps/xterm.js:11616:344 < anon@assets/main-00GW_4Xt.js:89:6",
    );
  });

  it("keeps at most six frames", () => {
    const stack = Array.from({ length: 12 }, (_, i) => `f${i}@http://h/a/b.js:${i}:1`).join("\n");
    expect(originOf("[cb]", stack).split(" < ")).toHaveLength(6);
  });

  it("falls back to the label when there is no stack", () => {
    expect(originOf("[cb]", undefined)).toBe("[cb]");
    expect(originOf("[cb]", "")).toBe("[cb]");
  });
});

describe("describeCallback", () => {
  it("names the callback and collapses whitespace in its source", () => {
    function render() {
      return 1 +
        2;
    }
    expect(describeCallback(render)).toMatch(/^\[render: function render\(\) \{ return 1 \+ 2; \}\]$/);
  });

  it("truncates a long body and labels an anonymous function", () => {
    const label = describeCallback((() => "x".repeat(500)) as () => string);
    expect(label.length).toBeLessThan(90);
    expect(label.startsWith("[anon: ")).toBe(true);
  });
});

describe("accumulator", () => {
  it("sums calls, time and the worst call per origin", () => {
    const acc = createAccumulator();
    recordCallback(acc, "a", 10);
    recordCallback(acc, "a", 30);
    recordCallback(acc, "b", 5);
    expect(acc.callbacks).toBe(3);
    expect(acc.callbackMs).toBe(45);
    expect(acc.origins.get("a")).toEqual({ calls: 2, ms: 40, max: 30 });
  });

  it("counts frames at or above the jank threshold and tracks the worst gap", () => {
    const acc = createAccumulator();
    recordFrameGap(acc, 16, 100);
    recordFrameGap(acc, 100, 100);
    recordFrameGap(acc, 250, 100);
    expect(acc.frames).toBe(3);
    expect(acc.jankFrames).toBe(2);
    expect(acc.worstGapMs).toBe(250);
  });
});

describe("buildReport", () => {
  it("orders origins by time spent and derives averages and the share of the window", () => {
    const acc = createAccumulator();
    recordCallback(acc, "small", 4);
    recordCallback(acc, "big", 60);
    recordCallback(acc, "big", 40);
    const report = buildReport(acc, 1000, CENSUS);
    expect(report.top.map((r) => r.origin)).toEqual(["big", "small"]);
    expect(report.top[0]).toEqual({ origin: "big", calls: 2, ms: 100, avg: 50, max: 60 });
    expect(report.rafShare).toBe(0.104);
    expect(report.rafCalls).toBe(3);
    expect(report.census).toBe(CENSUS);
  });

  it("limits the list and survives an empty window", () => {
    const acc = createAccumulator();
    for (let i = 0; i < 20; i += 1) recordCallback(acc, `o${i}`, i);
    expect(buildReport(acc, 1000, CENSUS, 5).top).toHaveLength(5);
    const empty = buildReport(createAccumulator(), 0, CENSUS);
    expect(empty.rafShare).toBe(0);
    expect(empty.top).toEqual([]);
  });

  it("formats as a tagged single-line JSON that round-trips", () => {
    const line = formatReport(buildReport(createAccumulator(), 1000, CENSUS));
    expect(line.startsWith("[profiler] {")).toBe(true);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line.slice("[profiler] ".length)).census).toEqual(CENSUS);
  });
});
