import type { AgentSignal } from "./types";

// An agent session, both the stored record and the icon on the tab, lasts as long as the
// agent process: only its exit ends it. StopFailure (a failed turn) and SessionEnd (also
// emitted by /clear and /resume, which keep the process alive) must not. Claude Code only
// emits SessionStart on launch, resume and /clear, so a session dropped while the process
// still runs would never be registered again.
export function endsAgentSession(kind: AgentSignal["kind"]): boolean {
  return kind === "exited";
}
