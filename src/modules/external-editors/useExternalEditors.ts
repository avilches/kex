import { useCallback, useSyncExternalStore } from "react";
import { native } from "@/lib/native";
import type { DetectedEditor } from "./types";

// Module-level cache so all hook instances share state and the scan runs once.
let cachedEditors: DetectedEditor[] = [];
let scanning = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): DetectedEditor[] {
  return cachedEditors;
}

function getScanningSnapshot(): boolean {
  return scanning;
}

// Separate listener set for scanning state
const scanListeners = new Set<() => void>();
function notifyScanning() {
  for (const l of scanListeners) l();
}
function subscribeScan(cb: () => void) {
  scanListeners.add(cb);
  return () => scanListeners.delete(cb);
}

export async function runEditorScan(): Promise<void> {
  if (scanning) return;
  scanning = true;
  notifyScanning();
  try {
    const result = await native.editorScan();
    cachedEditors = result;
    notify();
  } catch (e) {
    console.error("editor_scan failed:", e);
  } finally {
    scanning = false;
    notifyScanning();
  }
}

export function useExternalEditors() {
  const detectedEditors = useSyncExternalStore(subscribe, getSnapshot);
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
