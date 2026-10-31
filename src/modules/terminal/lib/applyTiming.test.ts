import { describe, expect, it } from "vitest";

import { createApplyTimer } from "./applyTiming";

function clock(ticks: number[]) {
  let i = 0;
  return () => ticks[Math.min(i++, ticks.length - 1)];
}

describe("createApplyTimer", () => {
  it("returns no line when no slot was touched", () => {
    const timer = createApplyTimer("fontFamily", clock([0, 5]));
    expect(timer.line()).toBeNull();
  });

  it("attributes each lap to its step and counts slots with a leaf as visible", () => {
    // start=0, begin=0, set lap=2, fit lap=12, resize lap=13, begin=13, set lap=14, fit lap=20, line=20
    const timer = createApplyTimer(
      "fontSize",
      clock([0, 0, 2, 12, 13, 13, 14, 20, 20]),
    );
    timer.begin("tab-a");
    timer.lap("set");
    timer.lap("fit");
    timer.lap("resize");
    timer.begin(null);
    timer.lap("set");
    timer.lap("fit");

    const line = timer.line();
    expect(line?.startsWith("[term-apply] ")).toBe(true);
    const payload = JSON.parse((line as string).slice("[term-apply] ".length));
    expect(payload).toEqual({
      option: "fontSize",
      totalMs: 20,
      slots: 2,
      visible: 1,
      perSlot: [
        { leaf: "tab-a", set: 2, fit: 10, resize: 1 },
        { leaf: null, set: 1, fit: 6, resize: 0 },
      ],
    });
  });

  it("ignores a lap before any slot began", () => {
    const timer = createApplyTimer("scrollback", clock([0, 1, 2]));
    timer.lap("set");
    expect(timer.line()).toBeNull();
  });
});
