import { listenFsChanged, watchAdd, watchRemove } from "@/modules/explorer/lib/watch";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { foldersToReload, isSelfWrite, visibleExpanded } from "./invalidate";
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
  const requestedRef = useRef<Map<string, number>>(new Map());
  const cacheRootRef = useRef<string | null>(null);
  // Mirrors the keys of `dirs` so the load effect can tell what it already holds
  // without depending on the state it also writes.
  const cacheKeysRef = useRef<Set<string>>(new Set());

  const wanted = useMemo(() => {
    const set = new Set<string>(visibleExpanded(expandedFolders));
    set.add("");
    set.add(selectedFolder);
    return [...set];
  }, [expandedFolders, selectedFolder]);
  const wantedKey = wanted.join("\n");

  const read = useCallback((folders: string[]) => {
    const r = rootRef.current;
    if (!r || folders.length === 0) return;
    const generation = ++generationRef.current;
    for (const f of folders) requestedRef.current.set(f, generation);
    setLoading(true);
    void notesReadDirs(r, folders)
      .then((list) => {
        if (generationRef.current === generation) setError(null);
        const fresh = list.filter((d) => requestedRef.current.get(d.folder) === generation);
        for (const d of fresh) {
          if (d.missing) cacheKeysRef.current.delete(d.folder);
          else cacheKeysRef.current.add(d.folder);
        }
        setDirs((prev) => {
          const next = new Map(prev);
          for (const d of fresh) {
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
      cacheRootRef.current = null;
      requestedRef.current = new Map();
      cacheKeysRef.current = new Set();
      setDirs(new Map());
      return;
    }
    // Forgetting the in-flight requests too, so an answer for the old root or for
    // a folder just collapsed cannot land in the cache after we drop its entry.
    for (const f of requestedRef.current.keys()) {
      if (!wanted.includes(f)) requestedRef.current.delete(f);
    }
    if (cacheRootRef.current !== root) {
      cacheRootRef.current = root;
      requestedRef.current = new Map();
      cacheKeysRef.current = new Set();
      setDirs(new Map());
    } else {
      // Nothing looks at a folder outside the wanted set, so its payload is dead weight.
      cacheKeysRef.current = new Set(wanted.filter((f) => cacheKeysRef.current.has(f)));
      setDirs((prev) => {
        const next = new Map<string, NotesDir>();
        for (const f of wanted) {
          const d = prev.get(f);
          if (d) next.set(f, d);
        }
        return next.size === prev.size ? prev : next;
      });
    }
    loadedRef.current = new Set(wanted);
    const abs = new Set(wanted.map((f) => (f === "" ? root : `${root}/${f}`)));
    const toAdd = [...abs].filter((p) => !watchedRef.current.has(p));
    const toRemove = [...watchedRef.current].filter((p) => !abs.has(p));
    if (toAdd.length > 0) watchAdd(toAdd);
    if (toRemove.length > 0) watchRemove(toRemove);
    watchedRef.current = abs;
    // Expanding or selecting a folder leaves every other cached folder valid: the
    // watcher covers the loaded set, so only what is absent needs a read.
    read(wanted.filter((f) => !cacheKeysRef.current.has(f)));
  }, [root, active, wantedKey, read]);

  // Mount-scoped, so it does not fire on the expands and selects that re-run the
  // load effect. NotesView really unmounts: the Sidebar drops it for a workspace
  // without a vault root, and an unreleased watch stays refcounted forever.
  useEffect(
    () => () => {
      if (watchedRef.current.size > 0) watchRemove([...watchedRef.current]);
      watchedRef.current = new Set();
      pendingRef.current = new Set();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  // Both change sources coalesce through one pending set and one timer, so a
  // burst of saves costs a single re-read instead of overlapping calls.
  const schedule = useCallback(
    (folders: string[]) => {
      if (folders.length === 0) return;
      for (const f of folders) pendingRef.current.add(f);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const next = [...pendingRef.current].filter((f) => loadedRef.current.has(f));
        pendingRef.current = new Set();
        if (next.length === 0) return;
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

  // A mutation the user just made has to show at once, and the watcher answers up
  // to 450 ms later, so the folders that change are re-read here by the same rule.
  const refreshPath = useCallback(
    (absPath: string) => {
      const r = rootRef.current;
      if (!r) return;
      read(foldersToReload(r, absPath, loadedRef.current));
    },
    [read],
  );

  return { dirs, loading, error, reload, refreshPath };
}
