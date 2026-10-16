// Non-critical, shared-by-all-windows recency of each tab. localStorage keeps it out of
// the workspace JSON: switching tabs must not make the persisted body dirty.

const KEY = "kex-tab-use";
export const TAB_USE_MAX_ENTRIES = 300;

export type TabUseMap = Record<string, number>;

function read(): TabUseMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as TabUseMap;
  } catch {
    return {};
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

export function pruneTabUse(liveIds: ReadonlySet<string>): void {
  const map = read();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!liveIds.has(id)) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) write(map);
}
