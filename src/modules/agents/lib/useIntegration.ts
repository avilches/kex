import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { setAgentNotifications, updateInstalledIntegrations } from "@/modules/settings/store";
import { installIntegration, integrationStatus, removeIntegration } from "./integrationActions";
import type { IntegrationAgent } from "./integrations";

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

type Ops = {
  status: () => Promise<boolean>;
  install: () => Promise<void>;
  remove: () => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function useIntegrationState(label: string, ops: Ops, { minBusyMs = 0 }: Options): IntegrationState {
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const opsRef = useRef(ops);
  opsRef.current = ops;

  const refresh = useCallback(() => {
    opsRef.current
      .status()
      .then(setReady)
      .catch(() => setReady(null));
  }, []);

  useEffect(refresh, [refresh]);

  const run = async (action: () => Promise<void>, expected: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await Promise.all([action(), wait(minBusyMs)]);
      setReady(expected);
    } catch (e) {
      console.error(`[kex] integration ${label} failed:`, e);
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
    install: () => run(() => opsRef.current.install(), true),
    remove: () => run(() => opsRef.current.remove(), false),
    refresh,
  };
}

export function useIntegration(agent: IntegrationAgent, options: Options = {}): IntegrationState {
  return useIntegrationState(
    agent,
    {
      status: () => integrationStatus(agent),
      install: () => installIntegration(agent, updateInstalledIntegrations),
      remove: () => removeIntegration(agent, updateInstalledIntegrations),
    },
    options,
  );
}

// Claude Code is the one integration that lives inside the user's own settings file, and its
// on/off flag is the agent notifications preference rather than an entry in the stored list.
export function useClaudeIntegration(options: Options = {}): IntegrationState {
  return useIntegrationState(
    "claude",
    {
      status: () => invoke<boolean>("agent_claude_hooks_status"),
      install: async () => {
        await invoke("agent_enable_claude_hooks");
        await setAgentNotifications(true);
      },
      remove: async () => {
        await invoke("agent_disable_claude_hooks");
        await setAgentNotifications(false);
      },
    },
    options,
  );
}
