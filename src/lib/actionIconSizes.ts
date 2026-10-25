export const ACTION_ICON_SIZE_MIN = 14;
export const ACTION_ICON_SIZE_MAX = 32;
export const DEFAULT_ACTION_ICON_SIZE = 20;

export function snapActionIconSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_ACTION_ICON_SIZE;
  return Math.min(ACTION_ICON_SIZE_MAX, Math.max(ACTION_ICON_SIZE_MIN, Math.round(value)));
}
