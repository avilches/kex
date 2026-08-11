import { native } from "@/lib/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_NOTES_CONFIG,
  deletePathInConfig,
  type NoteSortMode,
  type NotesConfig,
  parseNotesConfig,
  renamePathInConfig,
  serializeNotesConfig,
} from "./notesConfig";

const WRITE_DEBOUNCE_MS = 300;

export function kexJsonPath(root: string): string {
  return `${root.replace(/[\\/]+$/, "").replace(/\\/g, "/")}/kex.json`;
}

async function readRaw(root: string): Promise<string | null> {
  try {
    const res = await native.readFile(kexJsonPath(root));
    return res.kind === "text" ? res.content : null;
  } catch {
    return null;
  }
}

export function useNotesState(root: string | null, active: boolean) {
  const [config, setConfig] = useState<NotesConfig>({ ...DEFAULT_NOTES_CONFIG });
  const loadedRootRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  // Target root + payload for the write still waiting out its debounce, so an
  // unmount can flush it immediately instead of dropping it. Both are captured
  // at schedule time, unambiguous regardless of what root/config do afterwards.
  const pendingWriteRef = useRef<{ root: string; config: NotesConfig } | null>(null);

  useEffect(() => {
    // Reset must happen in the same effect as the load trigger: if root changes
    // while active stays true, a separate reset effect would run after this one
    // has already advanced loadedRootRef to the new root, making it a no-op.
    if (loadedRootRef.current !== null && loadedRootRef.current !== root) {
      loadedRootRef.current = null;
      setConfig({ ...DEFAULT_NOTES_CONFIG });
    }
    if (!root || !active || loadedRootRef.current === root) return;
    loadedRootRef.current = root;
    let cancelled = false;
    void readRaw(root).then((raw) => {
      if (!cancelled) setConfig(parseNotesConfig(raw));
    });
    return () => {
      cancelled = true;
    };
  }, [root, active]);

  const writeNow = useCallback((r: string, next: NotesConfig) => {
    void (async () => {
      const raw = await readRaw(r);
      try {
        await native.writeFile(kexJsonPath(r), serializeNotesConfig(raw, next));
      } catch (e) {
        console.error("[notes] kex.json write failed:", e);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      const pending = pendingWriteRef.current;
      if (pending) {
        pendingWriteRef.current = null;
        writeNow(pending.root, pending.config);
      }
    };
  }, [writeNow]);

  const scheduleWrite = useCallback(
    (next: NotesConfig) => {
      const r = rootRef.current;
      if (!r) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      pendingWriteRef.current = { root: r, config: next };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingWriteRef.current = null;
        writeNow(r, next);
      }, WRITE_DEBOUNCE_MS);
    },
    [writeNow],
  );

  const update = useCallback(
    (fn: (c: NotesConfig) => NotesConfig) => {
      setConfig((prev) => {
        const next = fn(prev);
        scheduleWrite(next);
        return next;
      });
    },
    [scheduleWrite],
  );

  const toggleQuickAccess = useCallback(
    (relPath: string) =>
      update((c) => ({
        ...c,
        quickAccess: c.quickAccess.includes(relPath)
          ? c.quickAccess.filter((p) => p !== relPath)
          : [...c.quickAccess, relPath],
      })),
    [update],
  );
  const reorderQuickAccess = useCallback(
    (paths: string[]) => update((c) => ({ ...c, quickAccess: paths })),
    [update],
  );
  const setSortMode = useCallback(
    (sortMode: NoteSortMode) => update((c) => ({ ...c, sortMode })),
    [update],
  );
  const setNoteOrder = useCallback(
    (noteOrder: Record<string, number>) => update((c) => ({ ...c, noteOrder })),
    [update],
  );
  const toggleFolderCollapsed = useCallback(
    (relPath: string) =>
      update((c) => ({
        ...c,
        collapsedFolders: c.collapsedFolders.includes(relPath)
          ? c.collapsedFolders.filter((p) => p !== relPath)
          : [...c.collapsedFolders, relPath],
      })),
    [update],
  );
  const setSelectedFolder = useCallback(
    (selectedFolder: string) => update((c) => ({ ...c, selectedFolder })),
    [update],
  );
  const setGroupByDate = useCallback(
    (groupByDate: boolean) => update((c) => ({ ...c, groupByDate })),
    [update],
  );
  const notePathRenamed = useCallback(
    (from: string, to: string) => update((c) => renamePathInConfig(c, from, to)),
    [update],
  );
  const notePathDeleted = useCallback(
    (relPath: string) => update((c) => deletePathInConfig(c, relPath)),
    [update],
  );

  return {
    config,
    toggleQuickAccess,
    reorderQuickAccess,
    setSortMode,
    setNoteOrder,
    toggleFolderCollapsed,
    setSelectedFolder,
    setGroupByDate,
    notePathRenamed,
    notePathDeleted,
  };
}
