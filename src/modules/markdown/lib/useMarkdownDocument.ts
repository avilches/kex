import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listenFsChanged,
  parentDir,
  watchAdd,
  watchRemove,
} from "@/modules/explorer/lib/watch";
import { useAutoSaveTimer } from "@/modules/editor/lib/useAutoSaveTimer";
import { useConflictFlag } from "@/modules/editor/lib/useConflictFlag";
import { shouldApplyReload } from "@/modules/editor/lib/reloadPlan";
import { MarkdownDocumentBuffer } from "@/modules/markdown/lib/documentBuffer";
import type { MarkdownTabMode } from "@/modules/markdown/lib/markdownTabShell";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { currentWorkspaceEnv } from "@/modules/workspace";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

// Survives a component unmount (e.g. dragging a tab to another pane) so an
// in-progress edit isn't force-saved to disk or lost just because the tab
// moved. See the matching cache in useDocument.ts (Source mode / the plain
// editor tab) for the full rationale, including why this is keyed by tabId
// rather than path; this is the Rich-mode equivalent, process-lifetime only.
const unflushedBodies = new Map<string, string>();

export type MarkdownDocState =
  | { status: "loading" }
  | { status: "ready"; body: string; revision: number }
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string };

type Options = {
  path: string;
  tabId: string;
  // Source mode mounts its own EditorPane, which already watches this same
  // path via useEditorFileSync. Without this, both watchers would fetch and
  // update conflict state independently for a single external change.
  mode: MarkdownTabMode;
  onDirtyChange?: (dirty: boolean) => void;
};

export function useMarkdownDocument({ path, tabId, mode, onDirtyChange }: Options) {
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [doc, setDoc] = useState<MarkdownDocState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);
  const { conflict, setConflict, keepLocalChanges } = useConflictFlag();

  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const autoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);
  const { autoSaveRef, clear: clearAutoSaveTimer, scheduleIfDirty } = useAutoSaveTimer(
    autoSave,
    autoSaveDelay,
  );

  const bufferRef = useRef<MarkdownDocumentBuffer | null>(null);
  // A restored buffer's body is already an edit, not pristine loaded content,
  // so the next setBaseline() call (the Tab component registers one once its
  // freshly booted editor instance is ready) must not treat it as the
  // round-trip-noise baseline: that would flip isDirty() to false even
  // though the body still doesn't match disk. See MarkdownDocumentBuffer's
  // own markSaved(), which resets baselineBody to null for the same reason.
  const suppressNextBaselineRef = useRef(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const revisionRef = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: autoSaveRef is a stable ref from useAutoSaveTimer, read fresh on each call
  const saveNow = useCallback(async () => {
    const buf = bufferRef.current;
    if (!buf) return;
    const content = buf.contentToSave();
    if (content === null) return;
    await invoke("fs_write_file", {
      path,
      content,
      workspace: currentWorkspaceEnv(),
      source: "editor",
    });
    buf.markSaved();
    setDirty(false);
    // Keep doc.body in sync with what was just written, without bumping revision:
    // a live Rich editor must not be force-refreshed by its own save, but a later
    // remount (e.g. a Rich -> Source -> Rich toggle) reads doc.body as its initial
    // content and would otherwise show what was on screen when the tab was opened.
    setDoc({ status: "ready", body: buf.getBody(), revision: revisionRef.current });
    if (autoSaveRef.current.autoSave) {
      toast.success(`Autosaved ${path.split(/[\\/]/).pop() || path}`);
    }
  }, [path]);

  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

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
          const buf = new MarkdownDocumentBuffer(res.content);
          const unflushed = unflushedBodies.get(tabId);
          unflushedBodies.delete(tabId);
          if (unflushed != null) {
            buf.setBody(unflushed);
            suppressNextBaselineRef.current = true;
          }
          bufferRef.current = buf;
          revisionRef.current = 0;
          setDirty(buf.isDirty());
          setDoc({
            status: "ready",
            body: buf.getBody(),
            revision: revisionRef.current,
          });
        } else if (res.kind === "binary") {
          bufferRef.current = null;
          setDoc({ status: "binary", size: res.size });
        } else if (res.kind === "toolarge") {
          bufferRef.current = null;
          setDoc({ status: "toolarge", size: res.size, limit: res.limit });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          bufferRef.current = null;
          setDoc({ status: "error", message: String(e) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, tabId]);

  // Applies the disk content unless the buffer is dirty and this isn't a
  // forced reload (force=true is how "Reload from disk" discards unsaved
  // edits). The fetch itself, and its catch below, always run regardless of
  // dirty/force: a file deleted or erroring out from under a dirty buffer
  // must still be reported, or a delete while editing goes unnoticed until
  // some other action forces a fresh read.
  const performReload = useCallback((force = false): void => {
    const applyContent = shouldApplyReload(force, dirtyRef.current);
    void invoke<ReadResult>("fs_read_file", { path, workspace: currentWorkspaceEnv() })
      .then((res) => {
        if (!applyContent) return;
        if (res.kind === "text") {
          const buf = bufferRef.current;
          if (!buf) {
            bufferRef.current = new MarkdownDocumentBuffer(res.content);
            revisionRef.current = 0;
            setDoc({
              status: "ready",
              body: bufferRef.current.getBody(),
              revision: revisionRef.current,
            });
            return;
          }
          if (!buf.replaceFromDisk(res.content, force)) return;
          revisionRef.current += 1;
          setDirty(false);
          setDoc({ status: "ready", body: buf.getBody(), revision: revisionRef.current });
        } else if (res.kind === "binary") {
          bufferRef.current = null;
          setDoc({ status: "binary", size: res.size });
        } else if (res.kind === "toolarge") {
          bufferRef.current = null;
          setDoc({ status: "toolarge", size: res.size, limit: res.limit });
        }
      })
      .catch((e) => setDoc({ status: "error", message: String(e) }));
  }, [path]);

  // While dirty, never clobber unsaved edits silently: block the pane on a
  // conflict overlay and let the user pick between keeping them (dismiss) or
  // discarding them for the disk version. performReload still runs (without
  // applying content) so a file removed while dirty is caught even though
  // its content sync is skipped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setConflict is a stable setState from useConflictFlag
  const reload = useCallback((): boolean => {
    const wasDirty = dirtyRef.current;
    if (wasDirty) setConflict(true);
    performReload();
    return !wasDirty;
  }, [performReload]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: setConflict is a stable setState from useConflictFlag
  const reloadFromDisk = useCallback(() => {
    setConflict(false);
    performReload(true);
  }, [performReload]);

  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // fs:file-written only fires from Kex's own fs_write_file (always tagged
  // source: "editor" for a save from this app), so it never reports a real
  // external edit; it only ever catches another Kex tab/window saving the
  // same path. Real external edits (another app, git, a script) only show up
  // on fs:changed, backed by the native watcher registered below.
  useEffect(() => {
    const unlistenPromise = getCurrentWebviewWindow().listen<{ path: string; source?: string }>(
      "fs:file-written",
      (event) => {
        if (modeRef.current !== "rich") return;
        if (event.payload.source === "editor") return;
        if (event.payload.path.replace(/\\/g, "/") !== path.replace(/\\/g, "/")) return;
        reloadRef.current();
      },
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, [path]);

  useEffect(() => {
    const dir = parentDir(path);
    watchAdd([dir]);
    return () => watchRemove([dir]);
  }, [path]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    const normalizedPath = path.replace(/\\/g, "/");
    void listenFsChanged((paths) => {
      if (modeRef.current !== "rich") return;
      if (paths.some((p) => p.replace(/\\/g, "/") === normalizedPath)) {
        reloadRef.current();
      }
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [path]);

  const save = useCallback(async () => {
    clearAutoSaveTimer();
    const buf = bufferRef.current;
    if (!buf?.isDirty()) return;
    await saveNow();
  }, [clearAutoSaveTimer, saveNow]);

  // Recorded once per load from the editor itself, so it matches what a save would
  // write for an untouched document. See docs/MARKDOWN_GOTCHAS.md, bug 2.
  const setBaseline = useCallback((body: string) => {
    const buf = bufferRef.current;
    if (!buf) return;
    if (suppressNextBaselineRef.current) {
      suppressNextBaselineRef.current = false;
      return;
    }
    buf.setBaseline(body);
    setDirty(buf.isDirty());
  }, []);

  const onChange = useCallback(
    (body: string) => {
      const buf = bufferRef.current;
      if (!buf) return;
      buf.setBody(body);
      const isDirty = buf.isDirty();
      setDirty(isDirty);
      scheduleIfDirty(isDirty, saveNow);
    },
    [scheduleIfDirty, saveNow],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: autoSaveRef is a stable ref from useAutoSaveTimer, read fresh on unmount
  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      const buf = bufferRef.current;
      if (buf?.isDirty()) {
        // Auto-save on: the preference already means "persist as things
        // happen", so this is the same safety net as before, just also
        // covering a pane move. Auto-save off: the user opted out of
        // unprompted disk writes, so the edit is carried in memory instead
        // and picked up if the same tab mounts again (see unflushedBodies).
        if (autoSaveRef.current.autoSave) {
          saveNow().catch((e) => {
            console.error("[autosave flush]", e);
          });
        } else {
          unflushedBodies.set(tabId, buf.getBody());
        }
      }
    };
  }, [tabId, clearAutoSaveTimer, saveNow]);

  return { doc, dirty, conflict, keepLocalChanges, reloadFromDisk, onChange, setBaseline, save, reload };
}
