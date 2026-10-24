import type { AgentId } from "./integrations";

export const AGENT_IDS = ["claude", "opencode", "omp", "pi", "codex"] as const satisfies readonly AgentId[];

/** After the first suggestion goes unanswered, Kex asks once more when this much time has passed. */
export const SUGGESTION_RETRY_MS = 15 * 24 * 60 * 60 * 1000;

export type SuggestionRecord = {
  /** Times the toast was shown for this agent. */
  asks: number;
  lastAskedAt: number | null;
  /** The integration was installed at some point, so it is never suggested again, even removed. */
  installedOnce: boolean;
};

export type SuggestionMap = Partial<Record<AgentId, SuggestionRecord>>;

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}

// The stored map comes from a user-editable JSON file: keep only well-formed entries of known agents.
export function parseSuggestions(raw: unknown): SuggestionMap {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: SuggestionMap = {};
  for (const agent of AGENT_IDS) {
    const entry = (raw as Record<string, unknown>)[agent];
    if (typeof entry !== "object" || entry === null) continue;
    const { asks, lastAskedAt, installedOnce } = entry as Record<string, unknown>;
    out[agent] = {
      asks: typeof asks === "number" && Number.isInteger(asks) && asks > 0 ? asks : 0,
      lastAskedAt: typeof lastAskedAt === "number" && Number.isFinite(lastAskedAt) ? lastAskedAt : null,
      installedOnce: installedOnce === true,
    };
  }
  return out;
}

export function shouldSuggest(record: SuggestionRecord | undefined, now: number): boolean {
  if (!record) return true;
  if (record.installedOnce) return false;
  if (record.asks === 0) return true;
  // Corrupt data (asked once, no date) is treated as done: better silent than a nag.
  if (record.asks === 1) {
    return record.lastAskedAt !== null && now - record.lastAskedAt >= SUGGESTION_RETRY_MS;
  }
  return false;
}

const EMPTY: SuggestionRecord = { asks: 0, lastAskedAt: null, installedOnce: false };

export function withAsked(map: SuggestionMap, agent: AgentId, now: number): SuggestionMap {
  const current = map[agent] ?? EMPTY;
  return { ...map, [agent]: { ...current, asks: current.asks + 1, lastAskedAt: now } };
}

export function withInstalled(map: SuggestionMap, agent: AgentId): SuggestionMap {
  const current = map[agent] ?? EMPTY;
  if (current.installedOnce) return map;
  return { ...map, [agent]: { ...current, installedOnce: true } };
}
