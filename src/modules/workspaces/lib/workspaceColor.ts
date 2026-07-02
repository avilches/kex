export const WORKSPACE_COLOR_PALETTE = [
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#ef4444", // red
] as const;

// Stable hue 0-359 derived from the workspace ID string.
export function idHue(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}

export function initialColorForId(id: string): string {
  return WORKSPACE_COLOR_PALETTE[idHue(id) % WORKSPACE_COLOR_PALETTE.length]!;
}

/**
 * Resolves the display color for a workspace.
 * - undefined/not set: use initialColorForId (new workspace, not yet explicitly colored)
 * - null: no color (user chose "Sin color")
 * - string: the explicit hex color
 */
export function resolveWorkspaceColor(
  color: string | null | undefined,
  id: string,
): string | null {
  if (color === null) return null;
  if (color === undefined) return initialColorForId(id);
  return color;
}

/**
 * Resolves the display color for a status.
 * Unlike workspace color, there is no "no color" (null) option -- statuses always show a color.
 * Falls back to a stable color derived from the status ID when no explicit color is set.
 */
export function resolveStatusColor(color: string | undefined, id: string): string {
  return color ?? initialColorForId(id);
}

export function randomStatusColor(): string {
  return WORKSPACE_COLOR_PALETTE[Math.floor(Math.random() * WORKSPACE_COLOR_PALETTE.length)]!;
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function randomVibrantColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 65 + Math.floor(Math.random() * 25);
  const l = 45 + Math.floor(Math.random() * 20);
  return hslToHex(h, s, l);
}
