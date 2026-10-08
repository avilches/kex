import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoverSwitch, HOVER_SWITCH_DELAY_MS } from "./hoverSwitch";

describe("createHoverSwitch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("switches after the delay while the pointer stays on the same workspace", () => {
    const onSwitch = vi.fn();
    const hover = createHoverSwitch(onSwitch);
    hover.enter("w2");
    vi.advanceTimersByTime(HOVER_SWITCH_DELAY_MS - 1);
    expect(onSwitch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("w2");
  });

  it("does not switch when the pointer leaves before the delay", () => {
    const onSwitch = vi.fn();
    const hover = createHoverSwitch(onSwitch);
    hover.enter("w2");
    vi.advanceTimersByTime(300);
    hover.leave("w2");
    vi.advanceTimersByTime(1000);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("restarts the timer when moving to another workspace", () => {
    const onSwitch = vi.fn();
    const hover = createHoverSwitch(onSwitch);
    hover.enter("w2");
    vi.advanceTimersByTime(400);
    hover.enter("w3");
    vi.advanceTimersByTime(400);
    expect(onSwitch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("w3");
  });

  it("ignores a leave for a workspace that is not the pending one", () => {
    const onSwitch = vi.fn();
    const hover = createHoverSwitch(onSwitch);
    hover.enter("w3");
    hover.leave("w2");
    vi.advanceTimersByTime(HOVER_SWITCH_DELAY_MS);
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith("w3");
  });

  it("cancel drops the pending switch", () => {
    const onSwitch = vi.fn();
    const hover = createHoverSwitch(onSwitch);
    hover.enter("w2");
    hover.cancel();
    vi.advanceTimersByTime(1000);
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
