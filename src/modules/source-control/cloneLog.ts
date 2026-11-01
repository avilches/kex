const KEEP_CHARS = 8192;

// The clone is followed by polling: each tick brings only what the process wrote since the last one.
// The error the user sees comes from the whole run, because git writes `fatal:` and exits in different ticks.
// `restarted`: the backend dropped old output, so the chunk is everything it still has and replaces the log.
export function appendCloneLog(log: string, chunk: string, restarted: boolean): string {
  const next = restarted ? chunk : log + chunk;
  return next.length > KEEP_CHARS ? next.slice(next.length - KEEP_CHARS) : next;
}

export function cloneFailureMessage(log: string, exitCode: number | null): string {
  const lines = log.trim().split("\n").filter(Boolean);
  return lines.slice(-3).join("\n") || `Clone failed (exit ${exitCode ?? "?"})`;
}
