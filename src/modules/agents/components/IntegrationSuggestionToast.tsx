import { toast } from "sonner";
import { suppressIntegrationToast } from "@/modules/onboarding/lib/onboardingState";
import { usePreferencesStore, whenHydrated } from "@/modules/settings/preferences";
import { readIntegrationSuggestions, updateIntegrationSuggestions } from "@/modules/settings/store";
import { agentStatus, installAgent, installErrorText } from "@/modules/agents/lib/agentIntegration";
import { AgentIcon } from "../lib/agentIcon";
import { createIntegrationSuggester } from "../lib/integrationSuggestionFlow";
import { AGENT_LABELS, type AgentId } from "../lib/integrations";

const TOAST_MS = 20_000;
// Sonner anchors the toast to the right edge, so a wider one grows to the left.
const TOAST_WIDTH = "min(480px, calc(100vw - 32px))";

// Shared by the toast and the tab menu: one install path, one pair of result toasts.
export async function installWithToast(agent: AgentId): Promise<void> {
  const name = AGENT_LABELS[agent];
  try {
    await installAgent(agent);
    toast.success(`${name} integration installed`);
  } catch (e) {
    console.error(`[kex] installing the ${agent} integration failed:`, e);
    toast.error(installErrorText(e, `Could not install the ${name} integration`));
  }
}

export function showIntegrationSuggestion(agent: AgentId): void {
  const name = AGENT_LABELS[agent];
  toast(`${name} is running without the Kex integration`, {
    description:
      "Install it to see the spinner and attention dot in the tab, and to keep your session when you undo a closed tab or hibernate one.",
    icon: <AgentIcon agent={agent} size={18} />,
    action: { label: "Install", onClick: () => void installWithToast(agent) },
    id: `integration-${agent}`,
    style: { width: TOAST_WIDTH },
    duration: TOAST_MS,
    closeButton: true,
  });
}

// Called when Kex detects an agent starting in a terminal.
export const suggestIntegration = createIntegrationSuggester({
  now: Date.now,
  // Before hydration the store holds the default onboarding state, which says finished.
  suppressed: async () => {
    await whenHydrated();
    return suppressIntegrationToast(usePreferencesStore.getState().onboarding);
  },
  status: agentStatus,
  read: readIntegrationSuggestions,
  update: updateIntegrationSuggestions,
  show: showIntegrationSuggestion,
});
