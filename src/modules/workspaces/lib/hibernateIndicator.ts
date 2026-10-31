import type { AgentSession } from "@/modules/agents/lib/types";

export type HibernateIndicator = "attention" | "error";

// The dot an agent had when its tab went to sleep. The live session ends with the PTY, so without this the
// dot would vanish from every surface while the tab sleeps. Working has no meaning once the agent is gone.
export function indicatorToKeep(
  session: (Pick<AgentSession, "status"> & Partial<Pick<AgentSession, "interrupted" | "restoreError">>) | undefined,
): HibernateIndicator | undefined {
  if (!session) return undefined;
  if (session.restoreError || session.interrupted) return "error";
  return session.status === "attention" ? "attention" : undefined;
}

// Test hook: a tab named Error shows the red dot and one named Warn the orange one, on every surface, so
// the dot can be tried without waiting for an agent to ask for attention.
export function titleIndicator(title: string | undefined): HibernateIndicator | null {
  const name = title?.trim().toLowerCase();
  return name === "error" ? "error" : name === "warn" ? "attention" : null;
}

export function sleepIndicator(tab: {
  kind?: string;
  title?: string;
  hibernation?: { indicator?: HibernateIndicator };
}): HibernateIndicator | null {
  return tab.hibernation?.indicator ?? titleIndicator(tab.title);
}
