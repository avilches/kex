export const PALETTE_INPUT_SELECTOR = '[cmdk-input=""][data-palette="command"]';

// A dialog opened over the command palette drops the focus on the page when it closes; as its
// close handler this gives it back to the palette input, if the palette is still there.
export function keepPaletteFocus(event: Event): void {
  const input = document.querySelector<HTMLInputElement>(PALETTE_INPUT_SELECTOR);
  if (!input) return;
  event.preventDefault();
  input.focus();
}

// A confirmation dialog opened over the palette owns the keyboard and the focus until it closes.
export function alertDialogOpen(): boolean {
  return document.querySelector('[role="alertdialog"][data-state="open"]') !== null;
}
