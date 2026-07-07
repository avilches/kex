import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { type NoteListItem, type NotesListResult, notesList } from "./notesList";

const REFRESH_DEBOUNCE_MS = 300;
const EMPTY: NotesListResult = { notes: [], folders: [], truncated: false };

export function useNotesIndex(root: string | null, active: boolean) {
  const [result, setResult] = useState<NotesListResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Flips once and stays true: gates the fs listener effect below so it never
  // subscribes (a real IPC call) until the hook has actually been activated.
  const [started, setStarted] = useState(false);
  const startedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  // Generation token: guards against an older in-flight notesList() call
  // (superseded by a newer root/refresh) clobbering the latest result.
  const generationRef = useRef(0);

  const load = useCallback(() => {
    const r = rootRef.current;
    if (!r) return;
    const generation = ++generationRef.current;
    setLoading(true);
    notesList(r)
      .then((res) => {
        if (generationRef.current !== generation) return;
        setResult(res);
        setError(null);
      })
      .catch((e) => {
        if (generationRef.current !== generation) return;
        setError(String(e));
      })
      .finally(() => {
        if (generationRef.current !== generation) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Reset must happen in the same effect as the load trigger: if root changes
    // while active stays true, a separate reset effect would run after this one
    // has already advanced startedRef to the new root, making it a no-op.
    if (startedRef.current !== null && startedRef.current !== root) {
      startedRef.current = null;
      setResult(EMPTY);
      setError(null);
    }
    if (!root || !active || startedRef.current === root) return;
    startedRef.current = root;
    setStarted(true);
    load();
  }, [root, active, load]);

  const scheduleRefresh = useCallback(() => {
    if (startedRef.current === null) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      load();
    }, REFRESH_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    if (!started) return;
    const win = getCurrentWebviewWindow();
    const underRoot = (p: string): boolean => {
      const r = rootRef.current;
      return r !== null && p.replace(/\\/g, "/").startsWith(r.replace(/\\/g, "/"));
    };
    const subs = [
      win.listen<{ paths: string[] }>("fs:changed", (e) => {
        if (e.payload.paths.some(underRoot)) scheduleRefresh();
      }),
      win.listen<{ path: string; source?: string }>("fs:file-written", (e) => {
        if (underRoot(e.payload.path)) scheduleRefresh();
      }),
    ];
    return () => {
      for (const s of subs) void s.then((un) => un());
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [scheduleRefresh, started]);

  return {
    notes: result.notes as NoteListItem[],
    folders: result.folders,
    truncated: result.truncated,
    loading,
    error,
    refresh: load,
  };
}
