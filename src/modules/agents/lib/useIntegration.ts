import { useCallback, useEffect, useState } from "react";
import { updateInstalledIntegrations } from "@/modules/settings/store";
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

export function useIntegration(agent: IntegrationAgent): IntegrationState {
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    integrationStatus(agent)
      .then(setReady)
      .catch(() => setReady(null));
  }, [agent]);

  useEffect(refresh, [refresh]);

  const run = async (action: typeof installIntegration, expected: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await action(agent, updateInstalledIntegrations);
      setReady(expected);
    } catch (e) {
      console.error(`[kex] integration ${agent} failed:`, e);
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
    install: () => run(installIntegration, true),
    remove: () => run(removeIntegration, false),
    refresh,
  };
}
