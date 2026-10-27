import { describe, expect, it, vi } from "vitest";
import { createFocusGate } from "./focusGate";
import { activateKeepingKeyboard, activateWithFocus } from "./tabActivation";

describe("tab activation and the focus gate", () => {
  it("keeps the focus away while the palette holds it", () => {
    const gate = createFocusGate();
    const focus = vi.fn();
    const activate = vi.fn();
    activateKeepingKeyboard(gate, activate);
    expect(activate).toHaveBeenCalledTimes(1);
    gate.run(focus);
    expect(focus).not.toHaveBeenCalled();
  });

  it("gives the focus back to the next ordinary activation, after the palette closed", () => {
    const gate = createFocusGate();
    const focused = vi.fn();
    activateKeepingKeyboard(gate, () => {});
    activateWithFocus(
      gate,
      () => {},
      () => gate.run(focused),
    );
    expect(focused).toHaveBeenCalledTimes(1);
  });

  it("focuses as before when nothing held the gate", () => {
    const gate = createFocusGate();
    const order: string[] = [];
    activateWithFocus(
      gate,
      () => order.push("activate"),
      () => gate.run(() => order.push("focus")),
    );
    expect(order).toEqual(["activate", "focus"]);
  });
});
