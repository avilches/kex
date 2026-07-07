import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { type NoteListItem, type NotesListResult, notesList } from "./notesList";

const REFRESH_DEBOUNCE_MS = 300;
const EMPTY: NotesListResult = { notes: [], folders: [], truncated: false };

export function useNotesIndex(root: string | null, active: boolean) {
  const [result, setResult] = useState<NotesListResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;

  const load = useCallback(() => {
    const r = rootRef.current;
    if (!r) return;
    setLoading(true);
    notesList(r)
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!root || !active || startedRef.current === root) return;
    startedRef.current = root;
    load();
  }, [root, active, load]);

  useEffect(() => {
    if (startedRef.current !== null && startedRef.current !== root) {
      startedRef.current = null;
      setResult(EMPTY);
      setError(null);
    }
  }, [root]);

  const scheduleRefresh = useCallback(() => {
    if (startedRef.current === null) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      load();
    }, REFRESH_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
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
  }, [scheduleRefresh]);

  return {
    notes: result.notes as NoteListItem[],
    folders: result.folders,
    truncated: result.truncated,
    loading,
    error,
    refresh: load,
  };
}
