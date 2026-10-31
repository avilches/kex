import { onPrefApplied } from "@/modules/settings/prefApplied";
import type { PrefKey } from "@/modules/settings/store";
import { useCallback, useEffect, useRef, useState } from "react";

export const APPLYING_TIMEOUT_MS = 15_000;

/**
 * Tracks a preference that the main window applies slowly. `start` marks it as
 * applying; the main window's acknowledgement clears it, and a timeout clears
 * it too so a lost acknowledgement never leaves the label stuck.
 */
export function useApplyingPref(key: PrefKey | undefined): {
  applying: boolean;
  start: () => void;
} {
  const [applying, setApplying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setApplying(false);
  }, []);

  useEffect(() => {
    if (!key) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void onPrefApplied((applied) => {
      if (applied === key) clear();
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, clear]);

  const start = useCallback(() => {
    if (!key) return;
    if (timer.current) clearTimeout(timer.current);
    setApplying(true);
    timer.current = setTimeout(clear, APPLYING_TIMEOUT_MS);
  }, [key, clear]);

  return { applying, start };
}
