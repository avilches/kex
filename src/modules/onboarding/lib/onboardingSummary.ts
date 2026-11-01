import type { IntegrationStatus } from "@/modules/agents/lib/integrations";
import { STYLE_PRESETS } from "./onboardingState";

export type StyleChoice = keyof typeof STYLE_PRESETS;

export function styleOf(scheme: StyleChoice, previewOnClick: boolean): StyleChoice | null {
  const match = (Object.keys(STYLE_PRESETS) as StyleChoice[]).find(
    (k) => STYLE_PRESETS[k].explorerGitColorScheme === scheme && STYLE_PRESETS[k].previewOnClick === previewOnClick,
  );
  return match ?? null;
}

export type AgentLine = { name: string; detected: boolean; status: IntegrationStatus | null };

// Only detected agents count: an agent missing from the machine is not pending work.
export function agentSummary(agents: readonly AgentLine[]): { installed: string[]; pending: string[] } {
  const detected = agents.filter((a) => a.detected);
  return {
    installed: detected.filter((a) => a.status === "installed").map((a) => a.name),
    pending: detected.filter((a) => a.status === "missing").map((a) => a.name),
  };
}
