export const DEFAULT_PALETTE_WIDTH = 860;
export const MIN_PALETTE_WIDTH = 560;
export const MAX_PALETTE_WIDTH = 1400;

export function clampPaletteWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PALETTE_WIDTH;
  return Math.round(Math.min(MAX_PALETTE_WIDTH, Math.max(MIN_PALETTE_WIDTH, value)));
}

// The dialog is centered, so each edge dragged by `delta` pixels moves both sides and the
// width changes by twice that; the left edge grows the dialog when dragged left.
export function widthAfterDrag(start: number, delta: number, edge: "left" | "right"): number {
  return clampPaletteWidth(start + (edge === "right" ? 2 * delta : -2 * delta));
}

// What the dialog is given: the saved width, never wider than the window minus a gutter.
export function paletteWidthCss(width: number): string {
  return `min(${width}px, calc(100vw - 32px))`;
}
