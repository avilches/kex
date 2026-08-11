import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { type NoteListItem, type NotesListResult, notesList } from "./notesList";
import { kexJsonPath } from "./useNotesState";

const REFRESH_DEBOUNCE_MS = 300;
const EMPTY: NotesListResult = { notes: [], folders: [], truncated: false };
const NOTE_EXTS = ["md", "markdown", "mdx"];

// Shared by both fs listeners so they cannot drift apart: rejects the vault's
// own kex.json (and its atomic-write .tmp siblings) and anything that could
// not change the note index (only markdown files and bare directory paths do).
function isNoteRelevantPath(root: string, path: string): boolean {
  const normRoot = root.replace(/\\/g, "/");
  const normPath = path.replace(/\\/g, "/");
  if (normPath !== normRoot && !normPath.startsWith(`${normRoot}/`)) return false;
  if (normPath === kexJsonPath(root)) return false;
  const basename = normPath.slice(normPath.lastIndexOf("/") + 1);
  if (basename.startsWith(".tmp")) return false;
  const dot = basename.lastIndexOf(".");
  if (dot === -1) return true;
  return NOTE_EXTS.includes(basename.slice(dot + 1).toLowerCase());
}

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
  // Coalesces concurrent walks: a load requested while one is already in
  // flight is deferred instead of firing a second overlapping invoke.
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  // Set while the view is inactive (fs events arrived but were ignored) so
  // the next activation forces one reload instead of showing stale data.
  const staleRef = useRef(false);

  const runLoad = useCallback((r: string, generation: number) => {
    inFlightRef.current = true;
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
        inFlightRef.current = false;
        if (generationRef.current === generation) setLoading(false);
        if (pendingRef.current) {
          pendingRef.current = false;
          const nextRoot = rootRef.current;
          if (nextRoot) runLoad(nextRoot, generationRef.current);
          else setLoading(false);
        }
      });
  }, []);

  const load = useCallback(() => {
    const r = rootRef.current;
    if (!r) return;
    const generation = ++generationRef.current;
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    runLoad(r, generation);
  }, [runLoad]);

  useEffect(() => {
    // Reset must happen in the same effect as the load trigger: if root changes
    // while active stays true, a separate reset effect would run after this one
    // has already advanced startedRef to the new root, making it a no-op.
    if (startedRef.current !== null && startedRef.current !== root) {
      startedRef.current = null;
      setResult(EMPTY);
      setError(null);
    }
    if (!root || !active) return;
    if (startedRef.current === root && !staleRef.current) return;
    startedRef.current = root;
    staleRef.current = false;
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
    if (!active) {
      // Stop re-walking the vault while invisible; force a reload on the
      // next activation instead so the index isn't stale when it reappears.
      staleRef.current = true;
      return;
    }
    const win = getCurrentWebviewWindow();
    const subs = [
      win.listen<{ paths: string[] }>("fs:changed", (e) => {
        const r = rootRef.current;
        if (r !== null && e.payload.paths.some((p) => isNoteRelevantPath(r, p))) {
          scheduleRefresh();
        }
      }),
      win.listen<{ path: string; source?: string }>("fs:file-written", (e) => {
        const r = rootRef.current;
        if (r !== null && isNoteRelevantPath(r, e.payload.path)) scheduleRefresh();
      }),
    ];
    return () => {
      for (const s of subs) void s.then((un) => un());
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [scheduleRefresh, started, active]);

  return {
    notes: result.notes as NoteListItem[],
    folders: result.folders,
    truncated: result.truncated,
    loading,
    error,
    refresh: load,
  };
}
