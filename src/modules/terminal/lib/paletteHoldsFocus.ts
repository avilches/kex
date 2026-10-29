// The input of the command palette inside a dialog that is open, not one still playing its exit
// animation: Radix keeps the content in the DOM for those ~100 ms and marks it data-state="closed".
// Same input as PALETTE_INPUT_SELECTOR; the palette module imports the terminal, so it cannot be
// imported from here.
export const OPEN_PALETTE_INPUT =
  '[data-slot="dialog-content"][data-state="open"] [cmdk-input=""][data-palette="command"]';

// While it is true a terminal that mounts or wakes must not take the focus from the palette input.
export function paletteHoldsFocus(doc: Document = document): boolean {
  return doc.querySelector(OPEN_PALETTE_INPUT) !== null;
}
