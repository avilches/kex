export const LIST_VIEWPORT_SELECTOR = '[data-slot="scroll-area-viewport"]';

export function listViewportOf(root: ParentNode | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(LIST_VIEWPORT_SELECTOR) ?? null;
}

// The list starts at its first row: the viewport is the one thing cmdk never resets, and it only
// scrolls the selected row into view when that row is out of sight.
export function scrollListToTop(root: ParentNode | null): void {
  const viewport = listViewportOf(root);
  if (viewport) viewport.scrollTop = 0;
}
