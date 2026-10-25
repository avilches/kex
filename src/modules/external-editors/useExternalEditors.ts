import { useCallback, useMemo, useSyncExternalStore } from "react";
import { native } from "@/lib/native";
import { usePreferencesStore, whenHydrated } from "@/modules/settings/preferences";
import { planAgentSeed } from "@/modules/actions/lib/agentSeed";
import { globalActions } from "@/modules/actions/lib/globalActionsBinding";
import { setAgentActionsSeeded, setDetectedEditors } from "@/modules/settings/store";
import type { DetectedEditor } from "./types";

// Module-level scanning state - not persisted; each webview tracks its own spinner.
let scanning = false;
const scanListeners = new Set<() => void>();

function notifyScanning() {
  for (const l of scanListeners) l();
}

function subscribeScan(cb: () => void) {
  scanListeners.add(cb);
  return () => scanListeners.delete(cb);
}

function getScanningSnapshot(): boolean {
  return scanning;
}

export function splitDetected(list: DetectedEditor[]) {
  return {
    detectedEditors: list.filter((e) => e.kind === "editor"),
    detectedAgents: list.filter((e) => e.kind === "agent"),
  };
}

export function mergeEnabled(
  result: DetectedEditor[],
  existing: DetectedEditor[],
): DetectedEditor[] {
  const enabledById = new Map(
    existing.map((e) => [`${e.kind}:${e.id}`, e.enabled]),
  );
  return result.map((e) => {
    const saved = enabledById.get(`${e.kind}:${e.id}`);
    return saved !== undefined ? { ...e, enabled: saved } : e;
  });
}

// The plan is computed from the live flag and the live Actions right before the writes, which go
// through the serialized queue. A partial failure leaves the flag false and the next scan only
// adds what is still missing. Only one window scans at startup (`runStartupEditorScan`), so the
// others never seed in parallel; they get the Actions and the flag through the preferences echo.
async function seedAgentActions(agents: DetectedEditor[]): Promise<void> {
  const seeded = usePreferencesStore.getState().agentActionsSeeded;
  if (seeded || !agents.some((a) => a.enabled !== false)) return;
  const plan = planAgentSeed({ seeded, agents, existing: globalActions.get() });
  await Promise.all(plan.map((a) => globalActions.add(a)));
  await setAgentActionsSeeded(true);
}

/** Run a full editor scan and persist results, preserving user-set enabled flags. */
export async function runEditorScan(): Promise<void> {
  if (scanning) return;
  scanning = true;
  notifyScanning();
  try {
    // Before hydration the store holds defaults, and seeding on them would overwrite the saved lists.
    const [result] = await Promise.all([native.editorScan(), whenHydrated()]);
    const existing: DetectedEditor[] = usePreferencesStore.getState().detectedEditors;
    const merged = mergeEnabled(result, existing);
    await setDetectedEditors(merged);
    await seedAgentActions(merged.filter((e) => e.kind === "agent"));
  } catch (e) {
    console.error("editor_scan failed:", e);
  } finally {
    scanning = false;
    notifyScanning();
  }
}

/** Startup scan: runs in the one window that wins the per-launch claim, never in the others. */
export async function runStartupEditorScan(): Promise<void> {
  let won = false;
  try {
    won = await native.claimStartupScan();
  } catch (e) {
    console.error("claim_startup_scan failed:", e);
  }
  if (won) await runEditorScan();
}

export function useExternalEditors() {
  const detected = usePreferencesStore((s) => s.detectedEditors);
  const { detectedEditors, detectedAgents } = useMemo(
    () => splitDetected(detected),
    [detected],
  );
  const isScanning = useSyncExternalStore(subscribeScan, getScanningSnapshot);
  const scan = useCallback(() => {
    void runEditorScan();
  }, []);
  return { detectedEditors, detectedAgents, isScanning, scan };
}
