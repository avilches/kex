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

// A workspace without a root has no automatic color: it only shows one the user picked.
// Defining the root brings back the automatic color, when the setting leaves it undefined.
export function workspaceDisplayColor(ws: {
  id: string;
  color?: string | null;
  workspaceRoot?: string;
}): string | null {
  if (ws.workspaceRoot) return resolveWorkspaceColor(ws.color, ws.id);
  return typeof ws.color === "string" ? ws.color : null;
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

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const MIN_CONTRAST_WITH_WHITE = 4.5;

// The active chip always carries white text. A workspace color too light for
// that is darkened toward black just enough to reach the contrast, which keeps
// its hue; a color that already reaches it is returned as is.
export function chipColorOnWhite(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let t = 0; t <= 1; t += 0.01) {
    const shade = `#${[r, g, b]
      .map((v) => Math.round(v! * (1 - t)).toString(16).padStart(2, "0"))
      .join("")}`;
    if (1.05 / (relativeLuminance(shade) + 0.05) >= MIN_CONTRAST_WITH_WHITE) return shade;
  }
  return "#000000";
}

export function randomVibrantColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 65 + Math.floor(Math.random() * 25);
  const l = 45 + Math.floor(Math.random() * 20);
  return hslToHex(h, s, l);
}
