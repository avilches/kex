import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import type { SplitNode } from "@/modules/workspaces/lib/types";
import { setMetrics } from "@/modules/workspaces/lib/terminalMetricsStore";
import { ptyIdForPanel } from "./useTerminalSession";
import { visibleTerminalPanels } from "./visibleTerminals";

export const TERMINAL_METRICS_INTERVAL_MS = 5000;

type RawMetrics = {
  pty_id: number;
  pid: number;
  cpu_percent: number;
  mem_bytes: number;
  shell_name: string;
};

export function useTerminalMetricsSampler(paneTree: SplitNode | null): void {
  const treeRef = useRef(paneTree);
  treeRef.current = paneTree;

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      const tree = treeRef.current;
      if (!tree) return;
      const pairs = visibleTerminalPanels(tree)
        .map((p) => ({ panelId: p.panelId, ptyId: ptyIdForPanel(p.panelId) }))
        .filter((x): x is { panelId: string; ptyId: number } => x.ptyId != null);
      if (pairs.length === 0) return;
      const byPty = new Map(pairs.map((x) => [x.ptyId, x.panelId]));
      try {
        const res = await invoke<RawMetrics[]>("pty_metrics", {
          ptyIds: pairs.map((x) => x.ptyId),
        });
        if (cancelled) return;
        for (const m of res) {
          const panelId = byPty.get(m.pty_id);
          if (!panelId) continue;
          setMetrics(panelId, {
            pid: m.pid,
            cpuPercent: m.cpu_percent,
            memBytes: m.mem_bytes,
            shellName: m.shell_name,
          });
        }
      } catch {
        // Sampling is best-effort; ignore transient invoke failures.
      }
    };

    const handle = setInterval(tick, TERMINAL_METRICS_INTERVAL_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);
}
