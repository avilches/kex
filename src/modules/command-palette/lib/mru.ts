// Non-critical, single-window usage ranking. localStorage keeps it off the
// preferences store and its IPC change-broadcast path.

const KEY = "kex-palette-mru";
const MAX_ENTRIES = 120;

type MruMap = Record<string, number>;

// Ids are ours, but the stored JSON is not: a map without a prototype keeps any key a plain
// key, and a stamp that is not a positive finite number would make the sort inconsistent.
function read(): MruMap {
  const out: MruMap = Object.create(null);
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    for (const [id, at] of Object.entries(parsed)) {
      if (typeof at === "number" && Number.isFinite(at) && at > 0) out[id] = at;
    }
  } catch {
    /* an unreadable value counts as empty */
  }
  return out;
}

export function recordUse(id: string): void {
  const map = read();
  map[id] = Date.now();
  const ids = Object.keys(map);
  if (ids.length > MAX_ENTRIES) {
    for (const k of ids
      .sort((a, b) => map[a] - map[b])
      .slice(0, ids.length - MAX_ENTRIES)) {
      delete map[k];
    }
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function mruSnapshot(): MruMap {
  return read();
}

export function mruRank(snapshot: MruMap, id: string): number {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn is ES2022 and the lib is ES2020
  return Object.prototype.hasOwnProperty.call(snapshot, id) ? snapshot[id] : 0;
}
