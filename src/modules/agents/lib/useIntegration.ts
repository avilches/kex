import { useCallback, useEffect, useRef, useState } from "react";
import { AgentNotDetectedError, agentStatus, installAgent, removeAgent } from "./agentIntegration";
import { type AgentId, blockOf, busyMsFor, type IntegrationBlock, type IntegrationStatus } from "./integrations";

export type IntegrationState = {
  /** null while the first check is pending or when it failed. */
  ready: boolean | null;
  /** Set when Install cannot run at all, and why; the UI explains it instead of offering Install. */
  blocked: IntegrationBlock | null;
  busy: boolean;
  failed: boolean;
  /** Set when the last action failed because the agent is not on this machine. */
  notFound: string | null;
  /** Resolve to whether the write worked; a failure also sets `failed`. */
  install: (opts?: RunOptions) => Promise<boolean>;
  remove: (opts?: RunOptions) => Promise<boolean>;
  refresh: () => void;
};

type Options = {
  /** The busy state lasts at least this long, so a write that finishes at once is still seen. */
  minBusyMs?: number;
  /** Up to this much more for a staggered run, drawn once per mount. */
  busyJitterMs?: number;
};

/** `staggered` is for a run started together with other rows (Install all), which adds this row's extra. */
export type RunOptions = { staggered?: boolean };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useIntegration(
  agent: AgentId,
  { minBusyMs = 0, busyJitterMs = 0 }: Options = {},
): IntegrationState {
  const [staggeredBusyMs] = useState(() => busyMsFor(minBusyMs, busyJitterMs, Math.random));
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const refresh = useCallback(() => {
    agentStatus(agentRef.current)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(refresh, [refresh]);

  const run = async (
    action: (agent: AgentId) => Promise<void>,
    expected: IntegrationStatus,
    { staggered = false }: RunOptions = {},
  ): Promise<boolean> => {
    const busyMs = staggered ? staggeredBusyMs : minBusyMs;
    setBusy(true);
    setFailed(false);
    setNotFound(null);
    try {
      await Promise.all([action(agentRef.current), wait(busyMs)]);
      setStatus(expected);
      return true;
    } catch (e) {
      console.error(`[kex] integration ${agentRef.current} failed:`, e);
      setFailed(true);
      setNotFound(e instanceof AgentNotDetectedError ? e.message : null);
      refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    ready: status === null ? null : status === "installed",
    blocked: blockOf(status),
    busy,
    failed,
    notFound,
    install: (opts) => run(installAgent, "installed", opts),
    remove: (opts) => run(removeAgent, "missing", opts),
    refresh,
  };
}
