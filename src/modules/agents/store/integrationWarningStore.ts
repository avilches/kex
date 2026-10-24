import { create } from "zustand";
import type { AgentId } from "../lib/integrations";

type IntegrationWarningState = {
  /** tabId -> agent running in that tab without the Kex integration. */
  byTab: Record<string, AgentId>;
  warn: (tabId: string, agent: AgentId) => void;
  clearTab: (tabId: string) => void;
  clearAgent: (agent: AgentId) => void;
};

export const useIntegrationWarningStore = create<IntegrationWarningState>((set) => ({
  byTab: {},
  warn: (tabId, agent) =>
    set((s) => (s.byTab[tabId] === agent ? s : { byTab: { ...s.byTab, [tabId]: agent } })),
  clearTab: (tabId) =>
    set((s) => {
      if (!(tabId in s.byTab)) return s;
      const { [tabId]: _gone, ...rest } = s.byTab;
      return { byTab: rest };
    }),
  clearAgent: (agent) =>
    set((s) => {
      const entries = Object.entries(s.byTab).filter(([, a]) => a !== agent);
      return entries.length === Object.keys(s.byTab).length ? s : { byTab: Object.fromEntries(entries) };
    }),
}));
