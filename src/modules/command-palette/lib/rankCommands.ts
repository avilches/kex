import type { PaletteItem } from "../types";
import { fuzzyBestLower, passesQuality } from "./fuzzy";
import { type LearnedMap, learnedBoost } from "./learned";
import { mruRank } from "./mru";

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

export function rankCommands(
  items: PaletteItem[],
  blobs: string[][],
  term: string,
  mru: Record<string, number>,
  learned: LearnedMap,
): PaletteItem[] {
  if (!term) {
    return [...items].sort((a, b) => mruRank(mru, b.id) - mruRank(mru, a.id));
  }
  const lowerTerm = term.toLowerCase();
  const scored: { item: PaletteItem; s: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const fuzzy = fuzzyBestLower(lowerTerm, blobs[i]);
    if (fuzzy === null || !passesQuality(lowerTerm.length, fuzzy)) continue;
    scored.push({ item: items[i], s: fuzzy + learnedBoost(learned, lowerTerm, commandRowKey(items[i].id)) });
  }
  scored.sort((a, b) => b.s - a.s || mruRank(mru, b.item.id) - mruRank(mru, a.item.id));
  return scored.map((x) => x.item);
}
