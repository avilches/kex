import type { IconSvgElement } from "@hugeicons/react";

export type CatalogEntry = { name: string; label: string; words: string; icon: IconSvgElement };

// "Home01Icon" -> "Home 01", "AArrowDownIcon" -> "A Arrow Down".
export function iconLabel(name: string): string {
  return name
    .replace(/Icon$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2");
}

export function buildCatalog(mod: Record<string, unknown>): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const [name, value] of Object.entries(mod)) {
    if (!name.endsWith("Icon") || !Array.isArray(value)) continue;
    const label = iconLabel(name);
    out.push({ name, label, words: label.toLowerCase(), icon: value as IconSvgElement });
  }
  return out;
}

// Every query word must appear in the icon name; exact label first, then
// prefix matches, then the rest alphabetically.
export function searchCatalog(catalog: CatalogEntry[], query: string, limit: number): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const hits = catalog.filter((e) => tokens.every((t) => e.words.includes(t)));
  const rank = (e: CatalogEntry) => (e.words === q ? 0 : e.words.startsWith(q) ? 1 : 2);
  hits.sort((a, b) => rank(a) - rank(b) || a.words.localeCompare(b.words));
  return hits.slice(0, limit);
}

let catalog: CatalogEntry[] | null = null;
let byName: Map<string, IconSvgElement> | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function subscribeCatalog(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function catalogVersion(): number {
  return version;
}

export function loadedCatalog(): CatalogEntry[] | null {
  return catalog;
}

// The full Hugeicons set is a separate chunk: nothing pays for it until
// someone searches or a saved icon is outside the built-in palette.
export function ensureCatalog(): Promise<void> {
  if (catalog) return Promise.resolve();
  loading ??= import("@hugeicons/core-free-icons")
    .then((mod) => {
      catalog = buildCatalog(mod as unknown as Record<string, unknown>);
      byName = new Map(catalog.map((e) => [e.name, e.icon]));
      version++;
      for (const cb of listeners) cb();
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

export function catalogIcon(name: string): IconSvgElement | null {
  if (!byName) {
    void ensureCatalog();
    return null;
  }
  return byName.get(name) ?? null;
}
