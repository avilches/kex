import { useCallback, useEffect, useRef, useState } from "react";
import { agentStatus, installAgent, removeAgent } from "./agentIntegration";
import { type AgentId, blockOf, type IntegrationBlock, type IntegrationStatus } from "./integrations";

export type IntegrationState = {
  /** null while the first check is pending or when it failed. */
  ready: boolean | null;
  /** Set when Install cannot run at all, and why; the UI explains it instead of offering Install. */
  blocked: IntegrationBlock | null;
  busy: boolean;
  failed: boolean;
  install: () => Promise<void>;
  remove: () => Promise<void>;
  refresh: () => void;
};

type Options = {
  /** The busy state lasts at least this long, so a write that finishes at once is still seen. */
  minBusyMs?: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useIntegration(agent: AgentId, { minBusyMs = 0 }: Options = {}): IntegrationState {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const refresh = useCallback(() => {
    agentStatus(agentRef.current)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(refresh, [refresh]);

  const run = async (action: (agent: AgentId) => Promise<void>, expected: IntegrationStatus) => {
    setBusy(true);
    setFailed(false);
    try {
      await Promise.all([action(agentRef.current), wait(minBusyMs)]);
      setStatus(expected);
    } catch (e) {
      console.error(`[kex] integration ${agentRef.current} failed:`, e);
      setFailed(true);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return {
    ready: status === null ? null : status === "installed",
    blocked: blockOf(status),
    busy,
    failed,
    install: () => run(installAgent, "installed"),
    remove: () => run(removeAgent, "missing"),
    refresh,
  };
}
