import { useCallback, useEffect, useRef, useState } from "react";
import { agentStatus, installAgent, removeAgent } from "./agentIntegration";
import type { AgentId } from "./integrations";

export type IntegrationState = {
  /** null while the first check is pending or when it failed. */
  ready: boolean | null;
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
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const refresh = useCallback(() => {
    agentStatus(agentRef.current)
      .then(setReady)
      .catch(() => setReady(null));
  }, []);

  useEffect(refresh, [refresh]);

  const run = async (action: (agent: AgentId) => Promise<void>, expected: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await Promise.all([action(agentRef.current), wait(minBusyMs)]);
      setReady(expected);
    } catch (e) {
      console.error(`[kex] integration ${agentRef.current} failed:`, e);
      setFailed(true);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return {
    ready,
    busy,
    failed,
    install: () => run(installAgent, true),
    remove: () => run(removeAgent, false),
    refresh,
  };
}
