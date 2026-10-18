import type { PaletteItem } from "../types";

// Precomputed once per items change; reused across keystrokes.
export function buildSearchBlobs(items: PaletteItem[]): string[][] {
  return items.map((item) => [
    item.title.toLowerCase(),
    item.group.toLowerCase(),
    ...(item.keywords?.map((k) => k.toLowerCase()) ?? []),
  ]);
}

export function commandRowKey(id: string): string {
  return `cmd:${id}`;
}
