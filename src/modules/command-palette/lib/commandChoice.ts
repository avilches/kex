import type { PaletteItem } from "../types";

export type CommandChoice = {
  action: "none" | "run" | "themes" | "content" | "history";
  learn: boolean;
};

// Three rows do not run anything: they switch the palette into another mode. They are still
// choices worth remembering, and are the ones most often reached by typing a few letters.
export function commandChoice(item: PaletteItem): CommandChoice {
  if (item.disabledReason) return { action: "none", learn: false };
  if (item.id === "theme.pick") return { action: "themes", learn: true };
  if (item.id === "search.content") return { action: "content", learn: true };
  if (item.id === "history.open") return { action: "history", learn: true };
  return { action: "run", learn: true };
}
