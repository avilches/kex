import { usePreferencesStore } from "@/modules/settings/preferences";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { startProfiler, stopProfiler } from "./profiler";

export function useProfilerSetting(): void {
  const enabled = usePreferencesStore((s) => s.performanceProfiler);
  useEffect(() => {
    if (!enabled) return;
    startProfiler(getCurrentWindow().label);
    return stopProfiler;
  }, [enabled]);
}
