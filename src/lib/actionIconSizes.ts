export const ACTION_ICON_SIZES = [16, 18, 20, 22, 24, 28] as const;
export const DEFAULT_ACTION_ICON_SIZE = 20;

export function snapActionIconSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_ACTION_ICON_SIZE;
  let best: number = ACTION_ICON_SIZES[0];
  for (const s of ACTION_ICON_SIZES) {
    if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  }
  return best;
}
