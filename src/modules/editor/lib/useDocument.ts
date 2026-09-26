import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAutoSaveTimer } from "@/modules/editor/lib/useAutoSaveTimer";
import { useConflictFlag } from "@/modules/editor/lib/useConflictFlag";
import { shouldApplyReload } from "@/modules/editor/lib/reloadPlan";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { usePreferencesStore } from "@/modules/settings/preferences";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

// Survives a component unmount (e.g. dragging a tab to another pane, which
// unmounts EditorPane in the source pane and mounts a fresh one in the
// target) so an in-progress edit isn't force-saved to disk or lost just
// because the tab moved. A real, guarded close (useTabCloseGuards) already
// saves or asks before disposing the tab; this only covers moves that never
// go through that flow. Keyed by tabId, not path: the same file can be open
// in two tabs (different panes or workspaces) at once, and keying by path
// would let one unmounting overwrite or adopt the other's stash. Process-
// lifetime only, so it does not survive an app quit.
const unflushedBuffers = new Map<string, string>();

export type DocumentState =
  | { status: "loading" }
  | { status: "ready"; content: string; size: number }
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string }
  | { status: "deleted" };

async function fileExists(path: string): Promise<boolean> {
  try {
    await invoke("fs_stat", { path, workspace: currentWorkspaceEnv() });
    return true;
  } catch {
    return false;
  }
}

type Options = {
  path: string;
  tabId: string;
  onDirtyChange?: (dirty: boolean) => void;
};

export function useDocument({ path, tabId, onDirtyChange }: Options) {
  const [doc, setDoc] = useState<DocumentState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);
  const { conflict, setConflict, keepLocalChanges } = useConflictFlag();

  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const autoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);
  const { autoSaveRef, clear: clearAutoSaveTimer, scheduleIfDirty } = useAutoSaveTimer(
    autoSave,
    autoSaveDelay,
  );

  // Track the saved buffer so we can detect changes cheaply.
  const savedRef = useRef<string>("");
  const bufferRef = useRef<string>("");
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const docStatusRef = useRef<DocumentState["status"]>("loading");
  docStatusRef.current = doc.status;

  // biome-ignore lint/correctness/useExhaustiveDependencies: autoSaveRef is a stable ref from useAutoSaveTimer, read fresh on each call
  const saveNow = useCallback(async () => {
    const content = bufferRef.current;
    await invoke("fs_write_file", {
      path,
      content,
      workspace: currentWorkspaceEnv(),
      source: "editor",
    });
    savedRef.current = content;
    setDirty(false);
    // TODO(debug): temporary autosave toast, remove once triggers are verified.
    if (autoSaveRef.current.autoSave) {
      toast.success(`Autosaved ${path.split(/[\\/]/).pop() || path}`);
    }
  }, [path]);

  // Notify parent of dirty transitions.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  // Load on path change or explicit reload.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setConflict is a stable setState from useConflictFlag
  useEffect(() => {
    let cancelled = false;
    setDoc({ status: "loading" });
    setDirty(false);
    setConflict(false);

    invoke<ReadResult>("fs_read_file", { path, workspace: currentWorkspaceEnv() })
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          const unflushed = unflushedBuffers.get(tabId);
          unflushedBuffers.delete(tabId);
          savedRef.current = res.content;
          bufferRef.current = unflushed ?? res.content;
          setDirty(unflushed != null && unflushed !== res.content);
          setDoc({
            status: "ready",
            content: bufferRef.current,
            size: res.size,
          });
        } else if (res.kind === "binary") {
          setDoc({ status: "binary", size: res.size });
        } else if (res.kind === "toolarge") {
          setDoc({
            status: "toolarge",
            size: res.size,
            limit: res.limit,
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        void fileExists(path).then((exists) => {
          if (cancelled) return;
          setDoc(exists ? { status: "error", message: String(e) } : { status: "deleted" });
        });
      });

    return () => {
      cancelled = true;
    };
  }, [path, tabId]);

  // Applies the disk content unless the buffer is dirty and this isn't a
  // forced reload (force=true is how the "Reload from disk" toast action
  // discards unsaved edits). The deletion check in the catch below always
  // runs regardless of dirty/force: an edit in progress must not hide that
  // its file was removed out from under it, or autosave would go on to
  // silently recreate it.
  const performReload = useCallback((force = false) => {
    const applyContent = shouldApplyReload(force, dirtyRef.current);
    void invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    })
      .then((res) => {
        if (!applyContent) return;
        if (res.kind === "text") {
          // The dedup check only exists to skip a wasted re-render for a
          // duplicate watcher event while the buffer is clean; a forced
          // reload (the user explicitly clicked "Reload from disk") must
          // always apply and discard the dirty buffer, even if the disk
          // content happens to already equal what was last read.
          if (!force && res.content === savedRef.current) return;
          savedRef.current = res.content;
          bufferRef.current = res.content;
          setDirty(false);
          setDoc({ status: "ready", content: res.content, size: res.size });
        } else if (res.kind === "binary") {
          setDoc({ status: "binary", size: res.size });
        } else if (res.kind === "toolarge") {
          setDoc({ status: "toolarge", size: res.size, limit: res.limit });
        }
      })
      .catch((e) => {
        void fileExists(path).then((exists) => {
          if (exists) {
            if (applyContent) setDoc({ status: "error", message: String(e) });
            return;
          }
          setDoc({ status: "deleted" });
        });
      });
  }, [path]);

  // While dirty, never clobber unsaved edits silently: block the pane on a
  // conflict overlay and let the user pick between keeping them (dismiss) or
  // discarding them for the disk version. performReload still runs (without
  // applying content) so a file removed while dirty is caught even though
  // its content sync is skipped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setConflict is a stable setState from useConflictFlag
  const reload = useCallback((): boolean => {
    if (dirtyRef.current) {
      performReload();
      setConflict(true);
      return false;
    }
    performReload();
    return true;
  }, [performReload]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: setConflict is a stable setState from useConflictFlag
  const reloadFromDisk = useCallback(() => {
    setConflict(false);
    performReload(true);
  }, [performReload]);

  const save = useCallback(async () => {
    clearAutoSaveTimer();
    // Compare buffers (updated synchronously in onChange) instead of the dirty
    // React state, which lags a render behind a focus-loss flush after a keystroke.
    if (bufferRef.current === savedRef.current) return;
    await saveNow();
  }, [clearAutoSaveTimer, saveNow]);

  // The explicit, opt-in way out of the deleted state: rewrite the in-memory
  // buffer to the original path (even if it is unchanged from the last read,
  // since save() would otherwise no-op) and hand the document back to the
  // normal editing flow.
  const recreate = useCallback(async () => {
    await saveNow();
    setDoc({ status: "ready", content: bufferRef.current, size: bufferRef.current.length });
  }, [saveNow]);

  // Guards against the file being detected as deleted between scheduling the
  // autosave and it actually firing.
  const saveIfNotDeleted = useCallback(async () => {
    if (docStatusRef.current === "deleted") return;
    await saveNow();
  }, [saveNow]);

  const onChange = useCallback(
    (next: string) => {
      bufferRef.current = next;
      const isDirty = next !== savedRef.current;
      setDirty(isDirty);
      scheduleIfDirty(isDirty && docStatusRef.current !== "deleted", saveIfNotDeleted);
    },
    [scheduleIfDirty, saveIfNotDeleted],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: autoSaveRef is a stable ref from useAutoSaveTimer, read fresh on unmount
  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      if (docStatusRef.current !== "deleted" && bufferRef.current !== savedRef.current) {
        // Auto-save on: the preference already means "persist as things
        // happen", so this is the same safety net as before, just also
        // covering a pane move. Auto-save off: the user opted out of
        // unprompted disk writes, so the edit is carried in memory instead
        // and picked up if the same tab mounts again (see unflushedBuffers).
        if (autoSaveRef.current.autoSave) {
          saveNow().catch((e) => {
            console.error("[autosave flush]", e);
          });
        } else {
          unflushedBuffers.set(tabId, bufferRef.current);
        }
      }
    };
  }, [tabId, clearAutoSaveTimer, saveNow]);

  return { doc, dirty, conflict, keepLocalChanges, reloadFromDisk, onChange, save, reload, recreate };
}
