export type UsageWindow = { usedPct: number; resetsAt?: number };

/** What Claude Code's status line last reported for a tab (`kex:agent-usage`). */
export type AgentUsage = {
  contextUsedPct?: number;
  fiveHour?: UsageWindow;
  sevenDay?: UsageWindow;
};

export type UsageLevel = "normal" | "high" | "critical";

export type UsageBadge = { label: string; level: UsageLevel; title: string };

const HIGH = 80;
const CRITICAL = 95;

function levelOf(pct: number): UsageLevel {
  return pct >= CRITICAL ? "critical" : pct >= HIGH ? "high" : "normal";
}

function round(pct: number): number {
  return Math.round(pct);
}

// A clock time, not a countdown: the tooltip is only rebuilt on a new reading, and an idle
// agent sends none, so "in 1h" would go stale.
function resetText(resetsAt: number | undefined, now: number): string {
  if (resetsAt === undefined || resetsAt * 1000 <= now) return "";
  const at = new Date(resetsAt * 1000);
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  if (at.toDateString() === new Date(now).toDateString())
    return `, resets at ${time}`;
  const day = at.toLocaleDateString("en-US", { weekday: "short" });
  return `, resets ${day} ${time}`;
}

export function sameUsage(
  a: AgentUsage | undefined,
  b: AgentUsage | undefined,
): boolean {
  return (
    a?.contextUsedPct === b?.contextUsedPct &&
    a?.fiveHour?.usedPct === b?.fiveHour?.usedPct &&
    a?.fiveHour?.resetsAt === b?.fiveHour?.resetsAt &&
    a?.sevenDay?.usedPct === b?.sevenDay?.usedPct &&
    a?.sevenDay?.resetsAt === b?.sevenDay?.resetsAt
  );
}

/**
 * The tab shows the context use; a rate limit window takes its place once it is the one
 * running out, since that is what would stop the agent first. `null` when there is nothing.
 */
export function usageBadge(
  usage: AgentUsage | undefined,
  now: number,
): UsageBadge | null {
  if (!usage) return null;
  const lines: string[] = [];
  const ctx = usage.contextUsedPct;
  if (ctx !== undefined) lines.push(`Context: ${round(ctx)}% used`);
  const windows: [string, string, UsageWindow | undefined][] = [
    ["5h", "5-hour limit", usage.fiveHour],
    ["7d", "Weekly limit", usage.sevenDay],
  ];
  let worst: { short: string; pct: number } | null = null;
  for (const [short, long, w] of windows) {
    if (!w) continue;
    lines.push(
      `${long}: ${round(w.usedPct)}% used${resetText(w.resetsAt, now)}`,
    );
    if (!worst || w.usedPct > worst.pct) worst = { short, pct: w.usedPct };
  }
  if (lines.length === 0) return null;
  const title = lines.join("\n");
  if (
    worst &&
    (ctx === undefined || (levelOf(worst.pct) !== "normal" && worst.pct >= ctx))
  ) {
    return {
      label: `${worst.short} ${round(worst.pct)}%`,
      level: levelOf(worst.pct),
      title,
    };
  }
  const shown = ctx ?? 0;
  return { label: `${round(shown)}%`, level: levelOf(shown), title };
}
