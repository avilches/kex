import { useCallback, useMemo, useSyncExternalStore } from "react";
import { native } from "@/lib/native";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setDetectedEditors } from "@/modules/settings/store";
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

/** Run a full editor scan and persist results, preserving user-set enabled flags. */
export async function runEditorScan(): Promise<void> {
  if (scanning) return;
  scanning = true;
  notifyScanning();
  try {
    const result = await native.editorScan();
    const existing: DetectedEditor[] = usePreferencesStore.getState().detectedEditors;
    await setDetectedEditors(mergeEnabled(result, existing));
  } catch (e) {
    console.error("editor_scan failed:", e);
  } finally {
    scanning = false;
    notifyScanning();
  }
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
