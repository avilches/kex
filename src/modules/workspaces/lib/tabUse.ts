// Non-critical, shared-by-all-windows recency of each tab. localStorage keeps it out of
// the workspace JSON: switching tabs must not make the persisted body dirty. Never pruned against
// one window's tabs: every window shares the map, and the entry cap bounds its size.

const KEY = "kex-tab-use";
export const TAB_USE_MAX_ENTRIES = 300;

export type TabUseMap = Record<string, number>;

// Ids are ours, but the stored JSON is not: a map without a prototype keeps any key a plain key.
const bare = (): TabUseMap => Object.create(null);

function read(): TabUseMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return bare();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return bare();
    // A stamp that is not a positive finite number would make the recency sort inconsistent.
    const out = bare();
    for (const [id, at] of Object.entries(parsed)) {
      if (typeof at === "number" && Number.isFinite(at) && at > 0) out[id] = at;
    }
    return out;
  } catch {
    return bare();
  }
}

function write(map: TabUseMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function recordTabUse(tabId: string, now = Date.now()): void {
  const map = read();
  map[tabId] = now;
  const ids = Object.keys(map);
  if (ids.length > TAB_USE_MAX_ENTRIES) {
    ids.sort((a, b) => map[a] - map[b]);
    for (const id of ids.slice(0, ids.length - TAB_USE_MAX_ENTRIES)) delete map[id];
  }
  write(map);
}

export function tabUseSnapshot(): TabUseMap {
  return read();
}
