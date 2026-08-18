import { listenFsChanged } from "@/modules/explorer/lib/watch";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useRef, useState } from "react";
import { type NoteHead, notesReadHeads } from "./notesDir";

// Pinned notes can live anywhere in the vault, so their titles are read for
// those paths alone: on activation, when the pin list changes, and when one of
// them is written, by this app or from outside.
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
    const isPinned = (path: string) => {
      const norm = path.replace(/\\/g, "/");
      return pinnedRef.current.some((rel) => norm.endsWith(`/${rel}`));
    };
    const sub = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (e) => {
        if (isPinned(e.payload.path)) load();
      },
    );
    const changed = listenFsChanged((paths) => {
      if (paths.some(isPinned)) load();
    });
    return () => {
      cancelled = true;
      void sub.then((un) => un());
      void changed.then((un) => un());
    };
  }, [root, active, key]);

  return heads;
}
