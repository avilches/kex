import { useCallback, useSyncExternalStore } from "react";
import { native } from "@/lib/native";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setDetectedEditors } from "@/modules/settings/store";

// Module-level scanning state — not persisted; each webview tracks its own spinner.
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

/** Run a full editor scan and persist results via the prefs store (shared across webviews). */
export async function runEditorScan(): Promise<void> {
  if (scanning) return;
  scanning = true;
  notifyScanning();
  try {
    const result = await native.editorScan();
    await setDetectedEditors(result);
  } catch (e) {
    console.error("editor_scan failed:", e);
  } finally {
    scanning = false;
    notifyScanning();
  }
}

export function useExternalEditors() {
  const detectedEditors = usePreferencesStore((s) => s.detectedEditors);
  const isScanning = useSyncExternalStore(subscribeScan, getScanningSnapshot);
  const scan = useCallback(() => {
    void runEditorScan();
  }, []);
  return { detectedEditors, isScanning, scan };
}

/** Fire-and-forget: launches the editor; returns an error string on failure. */
export async function openWithEditor(
  binary: string,
  argsBeforePath: string[],
  path: string,
): Promise<string | null> {
  try {
    await native.editorOpen(binary, argsBeforePath, path);
    return null;
  } catch (e) {
    return String(e);
  }
}
