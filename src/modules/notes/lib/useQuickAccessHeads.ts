import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useRef, useState } from "react";
import { type NoteHead, notesReadHeads } from "./notesDir";

// Pinned notes can live anywhere in the vault, so their titles are read for
// those paths alone: on activation, when the pin list changes, and when the app
// writes one of them.
export function useQuickAccessHeads(
  root: string | null,
  quickAccess: string[],
  active: boolean,
): Map<string, NoteHead> {
  const [heads, setHeads] = useState<Map<string, NoteHead>>(new Map());
  const key = quickAccess.join("\n");
  const pinnedRef = useRef(quickAccess);
  pinnedRef.current = quickAccess;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the pin list by value; the list itself is read through a ref so a new array identity does not refetch
  useEffect(() => {
    if (!root || !active || quickAccess.length === 0) {
      setHeads(new Map());
      return;
    }
    let cancelled = false;
    const load = () => {
      void notesReadHeads(root, pinnedRef.current)
        .then((list) => {
          if (!cancelled) setHeads(new Map(list.map((h) => [h.relPath, h])));
        })
        .catch((e) => console.error("[notes] reading pinned heads failed:", e));
    };
    load();
    const sub = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (e) => {
        const norm = e.payload.path.replace(/\\/g, "/");
        if (pinnedRef.current.some((rel) => norm.endsWith(`/${rel}`))) load();
      },
    );
    return () => {
      cancelled = true;
      void sub.then((un) => un());
    };
  }, [root, active, key]);

  return useMemo(() => heads, [heads]);
}
