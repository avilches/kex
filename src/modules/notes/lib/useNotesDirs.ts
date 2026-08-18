import { listenFsChanged, watchAdd, watchRemove } from "@/modules/explorer/lib/watch";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { foldersToReload, isSelfWrite } from "./invalidate";
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
    const abs = new Set(wanted.map((f) => (f === "" ? root : `${root}/${f}`)));
    const toAdd = [...abs].filter((p) => !watchedRef.current.has(p));
    const toRemove = [...watchedRef.current].filter((p) => !abs.has(p));
    if (toAdd.length > 0) watchAdd(toAdd);
    if (toRemove.length > 0) watchRemove(toRemove);
    watchedRef.current = abs;
    read(wanted);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [root, active, wantedKey, read]);

  // Both change sources coalesce through one pending set and one timer, so a
  // burst of saves costs a single re-read instead of overlapping calls.
  const schedule = useCallback(
    (folders: string[]) => {
      if (folders.length === 0) return;
      for (const f of folders) pendingRef.current.add(f);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const next = [...pendingRef.current];
        pendingRef.current = new Set();
        read(next);
      }, REFRESH_DEBOUNCE_MS);
    },
    [read],
  );

  useEffect(() => {
    if (!root || !active) return;
    const sub = listenFsChanged((paths) => {
      const r = rootRef.current;
      if (!r) return;
      const hits: string[] = [];
      for (const p of paths) {
        if (isSelfWrite(r, p)) continue;
        for (const f of foldersToReload(r, p, loadedRef.current)) hits.push(f);
      }
      schedule(hits);
    });
    const written = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (e) => {
        const r = rootRef.current;
        if (!r || isSelfWrite(r, e.payload.path)) return;
        schedule(foldersToReload(r, e.payload.path, loadedRef.current));
      },
    );
    return () => {
      void sub.then((un) => un());
      void written.then((un) => un());
    };
  }, [root, active, schedule]);

  const reload = useCallback(() => read([...loadedRef.current]), [read]);

  return { dirs, loading, error, reload };
}
