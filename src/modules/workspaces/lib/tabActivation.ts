import type { FocusGate } from "./focusGate";

// A navigation gesture hands the tab its focus, so it first opens the gate a palette may have held.
export function activateWithFocus(
  gate: FocusGate,
  activate: () => void,
  focus: () => void,
): void {
  gate.release();
  activate();
  focus();
}

// The palette activates a tab so its note can be seen, but the keyboard stays where it is.
export function activateKeepingKeyboard(gate: FocusGate, activate: () => void): void {
  gate.hold();
  activate();
}
