import { native } from "@/lib/native";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyOpsToRaw,
  DEFAULT_NOTES_CONFIG,
  deletePathInConfig,
  type NoteSortMode,
  type NotesConfig,
  type NotesOp,
  parseNotesConfig,
  pathsToCheck,
  pruneNotesConfig,
  renamePathInConfig,
  withAncestors,
} from "./notesConfig";
import { notesPathsExist } from "./notesDir";

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
  const [configLoaded, setConfigLoaded] = useState(false);
  const loadedRootRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  const configRef = useRef(config);
  configRef.current = config;
  // Edits (not state) waiting out the debounce, with the root they were made on, so an
  // unmount can flush them instead of dropping them. Each write replays them over the
  // file as it is on disk, which keeps another window's changes to the same kex.json.
  const pendingWriteRef = useRef<{ root: string; ops: NotesOp[] } | null>(null);
  const inFlightRef = useRef(0);

  useEffect(() => {
    // Reset must happen in the same effect as the load trigger: if root changes
    // while active stays true, a separate reset effect would run after this one
    // has already advanced loadedRootRef to the new root, making it a no-op.
    if (loadedRootRef.current !== null && loadedRootRef.current !== root) {
      loadedRootRef.current = null;
      setConfig({ ...DEFAULT_NOTES_CONFIG });
      setConfigLoaded(false);
    }
    if (!root || !active || loadedRootRef.current === root) return;
    loadedRootRef.current = root;
    let cancelled = false;
    void readRaw(root).then((raw) => {
      if (cancelled) return;
      setConfig(parseNotesConfig(raw));
      setConfigLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [root, active]);

  const writeNow = useCallback((r: string, ops: NotesOp[]) => {
    inFlightRef.current += 1;
    void (async () => {
      try {
        const raw = await readRaw(r);
        await native.writeFile(kexJsonPath(r), applyOpsToRaw(raw, ops));
      } catch (e) {
        console.error("[notes] kex.json write failed:", e);
      } finally {
        inFlightRef.current -= 1;
      }
    })();
  }, []);

  // Another window wrote kex.json: adopt it unless this window has edits of its own
  // waiting or in flight, which are replayed over the new content when they are written.
  useEffect(() => {
    if (!root || !active) return;
    const target = kexJsonPath(root);
    const busy = () => pendingWriteRef.current !== null || inFlightRef.current > 0;
    const written = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (e) => {
        if (e.payload.path.replace(/\\/g, "/") !== target || busy()) return;
        void readRaw(root).then((raw) => {
          if (busy()) return;
          const next = parseNotesConfig(raw);
          if (JSON.stringify(next) === JSON.stringify(configRef.current)) return;
          configRef.current = next;
          setConfig(next);
        });
      },
    );
    return () => {
      void written.then((un) => un());
    };
  }, [root, active]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      const pending = pendingWriteRef.current;
      if (pending) {
        pendingWriteRef.current = null;
        writeNow(pending.root, pending.ops);
      }
    };
  }, [writeNow]);

  const update = useCallback(
    (fn: NotesOp) => {
      const r = rootRef.current;
      if (!r) return;
      const prev = configRef.current;
      const next = fn(prev);
      if (next === prev) return;
      configRef.current = next;
      setConfig(next);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      const pending = pendingWriteRef.current;
      if (pending && pending.root !== r) writeNow(pending.root, pending.ops);
      const ops = pending && pending.root === r ? [...pending.ops, fn] : [fn];
      pendingWriteRef.current = { root: r, ops };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingWriteRef.current = null;
        writeNow(r, ops);
      }, WRITE_DEBOUNCE_MS);
    },
    [writeNow],
  );

  // Repairing kex.json belongs to whoever owns the file. Runs once per load, not
  // on every config edit: configLoaded (not the config object) is the trigger.
  useEffect(() => {
    if (!root || !active || !configLoaded) return;
    const paths = pathsToCheck(configRef.current);
    if (paths.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const answer = await notesPathsExist(root, paths);
        if (cancelled) return;
        const kinds = new Map(answer.map((a) => [a.relPath, a.kind]));
        update((c) => pruneNotesConfig(c, kinds));
      } catch (e) {
        console.error("[notes] existence check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, active, update, configLoaded]);

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
  const setFolderOrder = useCallback(
    (folder: string, names: string[]) =>
      update((c) => ({ ...c, folderOrder: { ...c.folderOrder, [folder]: names } })),
    [update],
  );
  const toggleFolderExpanded = useCallback(
    (relPath: string) =>
      update((c) => ({
        ...c,
        expandedFolders: c.expandedFolders.includes(relPath)
          ? c.expandedFolders.filter((p) => p !== relPath)
          : [...c.expandedFolders, relPath],
      })),
    [update],
  );
  const expandFolder = useCallback(
    (relPath: string) =>
      update((c) =>
        c.expandedFolders.includes(relPath)
          ? c
          : { ...c, expandedFolders: [...c.expandedFolders, relPath] },
      ),
    [update],
  );
  const setSelectedFolder = useCallback(
    (selectedFolder: string) =>
      update((c) => {
        const expandedFolders = withAncestors(c.expandedFolders, selectedFolder);
        return c.selectedFolder === selectedFolder &&
          expandedFolders === c.expandedFolders
          ? c
          : { ...c, selectedFolder, expandedFolders };
      }),
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
    configLoaded,
    toggleQuickAccess,
    reorderQuickAccess,
    setSortMode,
    setFolderOrder,
    toggleFolderExpanded,
    expandFolder,
    setSelectedFolder,
    setGroupByDate,
    notePathRenamed,
    notePathDeleted,
  };
}
