const PALETTE_INPUT = '[cmdk-input=""][data-palette="command"]';

// A dialog opened over the command palette drops the focus on the page when it closes; as its
// close handler this gives it back to the palette input, if the palette is still there.
export function keepPaletteFocus(event: Event): void {
  const input = document.querySelector<HTMLInputElement>(PALETTE_INPUT);
  if (!input) return;
  event.preventDefault();
  input.focus();
}
