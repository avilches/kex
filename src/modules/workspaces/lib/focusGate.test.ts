// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFocusGate } from "./focusGate";

afterEach(() => vi.useRealTimers());

describe("focus gate", () => {
  it("runs the focus when nothing holds the keyboard", () => {
    const focus = vi.fn();
    createFocusGate().run(focus);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("drops a focus requested in the next frame and one requested after 300 ms while held", () => {
    vi.useFakeTimers();
    const gate = createFocusGate();
    const input = document.createElement("input");
    const terminal = document.createElement("textarea");
    document.body.append(input, terminal);
    input.focus();
    gate.hold();
    const steal = () => gate.run(() => terminal.focus());
    requestAnimationFrame(steal);
    setTimeout(steal, 300);
    vi.advanceTimersByTime(400);
    expect(document.activeElement).toBe(input);
    gate.release();
    steal();
    expect(document.activeElement).toBe(terminal);
    input.remove();
    terminal.remove();
  });
});
