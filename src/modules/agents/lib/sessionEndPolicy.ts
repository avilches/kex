import type { AgentSession, AgentSignal } from "./types";

// An agent session, both the stored record and the icon on the tab, lasts as long as the
// agent process: only its exit ends it. StopFailure (a failed turn) and SessionEnd (also
// emitted by /clear and /resume, which keep the process alive) must not. Claude Code only
// emits SessionStart on launch, resume and /clear, so a session dropped while the process
// still runs would never be registered again.
export function endsAgentSession(kind: AgentSignal["kind"]): boolean {
  return kind === "exited";
}

// Whether the stored record is dropped when a session ends. Hibernating kills the PTY on
// purpose, so its exit must keep the record for the wake-up restore.
export function detachesRecord(kind: AgentSignal["kind"], hibernating: boolean): boolean {
  return endsAgentSession(kind) && !hibernating;
}

// A failed restore leaves a placeholder session on the tab. It must not count as a running
// agent, or the next `started` signal (the user launching claude by hand) never replaces it
// and the tab stays flagged as failed until that agent exits.
export function isRunningAgentSession(session: AgentSession | undefined): boolean {
  return session !== undefined && !session.restoreError;
}
