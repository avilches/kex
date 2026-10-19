import type { AgentStatus } from "@/modules/agents/lib/types";

export type TabStatusIndicator = "restoring" | "restore-failed" | "interrupted" | "working" | "attention" | null;

type Input = {
  restoreBusy: boolean;
  restorePending: boolean;
  hasAgent: boolean;
  isRestoreError: boolean;
  interrupted?: boolean;
  status: AgentStatus | undefined;
};

// A retry in flight wins so the user sees something happen; when it ends the failure marker
// comes back by itself if the plan is still pending.
export function tabStatusIndicator(i: Input): TabStatusIndicator {
  if (i.restoreBusy) return "restoring";
  if (i.restorePending || (i.hasAgent && i.isRestoreError)) return "restore-failed";
  if (!i.hasAgent) return null;
  if (i.interrupted) return "interrupted";
  if (i.status === "working") return "working";
  if (i.status === "attention") return "attention";
  return null;
}
