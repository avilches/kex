export const WORKSPACE_COLOR_PALETTE = [
  "#4f8ef7", // blue
  "#7c6af7", // violet
  "#c45af7", // purple
  "#f75a8e", // pink
  "#f7874f", // orange
  "#f7c34f", // yellow
  "#4fc97a", // green
  "#4fc9c9", // teal
  "#f75a5a", // red
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
