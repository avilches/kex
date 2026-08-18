import { listenFsChanged, watchAdd, watchRemove } from "@/modules/explorer/lib/watch";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { foldersToReload } from "./invalidate";
import { type NotesDir, notesReadDirs } from "./notesDir";

const REFRESH_DEBOUNCE_MS = 300;

export function useNotesDirs(
  root: string | null,
  active: boolean,
  expandedFolders: string[],
  selectedFolder: string,
) {
  const [dirs, setDirs] = useState<Map<string, NotesDir>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  const loadedRef = useRef<Set<string>>(new Set());
  const watchedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);

  const wanted = useMemo(() => {
    const set = new Set<string>([""]);
    for (const f of expandedFolders) set.add(f);
    set.add(selectedFolder);
    return [...set];
  }, [expandedFolders, selectedFolder]);
  const wantedKey = wanted.join("\n");

  const read = useCallback((folders: string[]) => {
    const r = rootRef.current;
    if (!r || folders.length === 0) return;
    const generation = ++generationRef.current;
    setLoading(true);
    void notesReadDirs(r, folders)
      .then((list) => {
        if (generationRef.current !== generation) return;
        setError(null);
        setDirs((prev) => {
          const next = new Map(prev);
          for (const d of list) {
            if (d.missing) next.delete(d.folder);
            else next.set(d.folder, d);
          }
          return next;
        });
      })
      .catch((e) => {
        if (generationRef.current === generation) setError(String(e));
      })
      .finally(() => {
        if (generationRef.current === generation) setLoading(false);
      });
  }, []);

  // Root change and deactivation both drop everything: nothing is read or
  // watched while the view is hidden.
  // biome-ignore lint/correctness/useExhaustiveDependencies: wantedKey stands for the wanted set by value
  useEffect(() => {
    if (!root || !active) {
      if (watchedRef.current.size > 0) {
        watchRemove([...watchedRef.current]);
        watchedRef.current = new Set();
      }
      loadedRef.current = new Set();
      setDirs(new Map());
      return;
    }
    loadedRef.current = new Set(wanted);
    const abs = wanted.map((f) => (f === "" ? root : `${root}/${f}`));
    watchAdd(abs);
    watchedRef.current = new Set(abs);
    read(wanted);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [root, active, wantedKey, read]);

  useEffect(() => {
    if (!root || !active) return;
    const sub = listenFsChanged((paths) => {
      const r = rootRef.current;
      if (!r) return;
      for (const p of paths) {
        for (const f of foldersToReload(r, p, loadedRef.current)) {
          pendingRef.current.add(f);
        }
      }
      if (pendingRef.current.size === 0) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const folders = [...pendingRef.current];
        pendingRef.current = new Set();
        read(folders);
      }, REFRESH_DEBOUNCE_MS);
    });
    const written = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (e) => {
        const r = rootRef.current;
        if (!r) return;
        const folders = foldersToReload(r, e.payload.path, loadedRef.current);
        if (folders.length > 0) read(folders);
      },
    );
    return () => {
      void sub.then((un) => un());
      void written.then((un) => un());
    };
  }, [root, active, read]);

  const reload = useCallback(() => read([...loadedRef.current]), [read]);

  return { dirs, loading, error, reload };
}
