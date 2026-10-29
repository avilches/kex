import type { MouseEvent } from "react";
import { isScratchpadOpen } from "./useTerminalSession";

// A drag source is focusable (dnd-kit sets tabIndex), so its mousedown would
// move DOM focus off the scratchpad and close it before the drag could land.
export function holdsScratchpadFocus(
  button: number,
  scratchpadOpen: boolean,
): boolean {
  return button === 0 && scratchpadOpen;
}

export function keepScratchpadFocus(e: MouseEvent): void {
  if (holdsScratchpadFocus(e.button, isScratchpadOpen())) e.preventDefault();
}
