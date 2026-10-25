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

const GUTTER = 32;

// Rounds to a whole device pixel: text painted on a fraction of one looks blurred.
function snap(value: number, ratio: number): number {
  return Math.round(value * ratio) / ratio;
}

// Where the dialog goes: the saved width, never wider than the window minus a gutter, and its left and
// top edges, all on whole device pixels. Centering by CSS (left 50% and a half-width shift) lands on
// half a pixel whenever the window or the dialog has an odd size. The width is an even count of device
// pixels so that its half is whole too.
export function paletteBox(
  width: number,
  viewportWidth: number,
  viewportHeight: number,
  ratio: number,
): { width: number; left: number; top: number } {
  const dpr = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const wanted = Math.min(width, Math.max(0, viewportWidth - GUTTER));
  const evenDevicePixels = Math.floor((wanted * dpr) / 2) * 2;
  const fitted = Math.max(evenDevicePixels, 2) / dpr;
  return {
    width: fitted,
    left: snap((viewportWidth - fitted) / 2, dpr),
    top: snap(viewportHeight / 3, dpr),
  };
}
