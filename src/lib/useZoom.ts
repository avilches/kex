import { useCallback, useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setZoomLevel } from "@/modules/settings/store";
import { DEFAULT_ZOOM, stepZoom } from "@/lib/zoomLevels";

const CSS_VAR = "--app-zoom";

function applyToDom(z: number): void {
  document.documentElement.style.setProperty(CSS_VAR, String(z));
}

export function useZoom() {
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const lastAppliedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (lastAppliedRef.current === zoomLevel) return;
    lastAppliedRef.current = zoomLevel;
    applyToDom(zoomLevel);
  }, [hydrated, zoomLevel]);

  const zoomIn = useCallback(() => {
    const current = usePreferencesStore.getState().zoomLevel;
    const next = stepZoom(current, 1);
    if (next !== current) void setZoomLevel(next);
  }, []);

  const zoomOut = useCallback(() => {
    const current = usePreferencesStore.getState().zoomLevel;
    const next = stepZoom(current, -1);
    if (next !== current) void setZoomLevel(next);
  }, []);

  const zoomReset = useCallback(() => {
    if (usePreferencesStore.getState().zoomLevel !== DEFAULT_ZOOM) {
      void setZoomLevel(DEFAULT_ZOOM);
    }
  }, []);

  return { zoomIn, zoomOut, zoomReset };
}
