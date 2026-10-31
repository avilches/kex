import type { AgentStatus } from "@/modules/agents/lib/types";

export type TabStatusIndicator = "restoring" | "restore-failed" | "interrupted" | "working" | "attention" | null;

type Input = {
  restoreBusy: boolean;
  restorePending: boolean;
  hasAgent: boolean;
  isRestoreError: boolean;
  interrupted?: boolean;
  status: AgentStatus | undefined;
  // The dot the tab kept when it went to sleep, shown while no live session exists.
  sleepIndicator?: "attention" | "error" | null;
  // What a plain terminal (no agent) is doing: a command running, or the last one failed.
  commandMark?: "working" | "error" | null;
};

// A retry in flight wins so the user sees something happen; when it ends the failure marker
// comes back by itself if the plan is still pending.
export function tabStatusIndicator(i: Input): TabStatusIndicator {
  if (i.restoreBusy) return "restoring";
  if (i.restorePending || (i.hasAgent && i.isRestoreError)) return "restore-failed";
  if (!i.hasAgent) {
    if (i.sleepIndicator === "error") return "interrupted";
    if (i.sleepIndicator === "attention") return "attention";
    return i.commandMark === "working" ? "working" : i.commandMark === "error" ? "interrupted" : null;
  }
  if (i.interrupted) return "interrupted";
  if (i.status === "working") return "working";
  if (i.status === "attention") return "attention";
  return null;
}
