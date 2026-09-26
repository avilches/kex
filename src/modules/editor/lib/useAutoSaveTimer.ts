import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

export function reportAutoSaveError(e: unknown): void {
  console.error("[autosave]", e);
  toast.error("Autosave failed", {
    description: e instanceof Error ? e.message : String(e),
  });
}

// Shared between useDocument.ts (Source mode / the plain editor tab) and
// useMarkdownDocument.ts (Rich mode): both debounce a save the same amount of
// time after a dirty edit, and both need the latest autoSave/autoSaveDelay
// preference in a callback without retriggering effects that depend on it.
export function useAutoSaveTimer(autoSave: boolean, autoSaveDelay: number) {
  const autoSaveRef = useRef({ autoSave, autoSaveDelay });
  autoSaveRef.current = { autoSave, autoSaveDelay };

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Schedules saveNow() after the current autoSaveDelay if autoSave is on and
  // the edit left the buffer dirty; no-ops otherwise. Always clears any timer
  // already pending, so a later keystroke replaces the earlier one's timer.
  const scheduleIfDirty = useCallback(
    (isDirty: boolean, saveNow: () => Promise<void>) => {
      clear();
      if (!autoSaveRef.current.autoSave || !isDirty) return;
      timeoutRef.current = setTimeout(() => {
        saveNow().catch(reportAutoSaveError);
      }, autoSaveRef.current.autoSaveDelay);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  return { autoSaveRef, clear, scheduleIfDirty };
}
