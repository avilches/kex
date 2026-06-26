import type { AgentStatus } from "@/modules/agents/lib/types";

export function agentChip(status: AgentStatus): { dotClass: string; title: string } {
  switch (status) {
    case "working":
      return { dotClass: "bg-amber-400", title: "Agent working" };
    case "waiting":
      return { dotClass: "bg-destructive", title: "Agent waiting for input" };
    case "idle":
      return { dotClass: "bg-emerald-500/50", title: "Agent idle" };
  }
}
