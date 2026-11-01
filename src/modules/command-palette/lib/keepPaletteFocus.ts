import { OPEN_PALETTE_INPUT } from "@/modules/terminal/lib/paletteHoldsFocus";

export const PALETTE_INPUT_SELECTOR = '[cmdk-input=""][data-palette="command"]';

// A dialog opened over the command palette drops the focus on the page when it closes; as its
// close handler this gives it back to the palette input, if the palette is still open: one playing its
// exit animation stays in the DOM marked closed and must not get the focus (see paletteHoldsFocus).
export function keepPaletteFocus(event: Event): void {
  const input = document.querySelector<HTMLInputElement>(OPEN_PALETTE_INPUT);
  if (!input) return;
  event.preventDefault();
  input.focus();
}

// A confirmation dialog opened over the palette owns the keyboard and the focus until it closes.
export function alertDialogOpen(): boolean {
  return document.querySelector('[role="alertdialog"][data-state="open"]') !== null;
}

// Presses the confirm button (the last of the footer) of the open confirmation dialog, if it is enabled.
export function confirmAlertDialog(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    '[role="alertdialog"][data-state="open"] [data-slot="alert-dialog-footer"] button',
  );
  const confirm = buttons[buttons.length - 1];
  if (confirm && !confirm.disabled) confirm.click();
}
