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
import { MarkdownDocumentBuffer } from "@/modules/markdown/lib/documentBuffer";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { currentWorkspaceEnv } from "@/modules/workspace";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

// Survives a component unmount (e.g. dragging a tab to another pane) so an
// in-progress edit isn't force-saved to disk or lost just because the tab
// moved. See the matching cache in useDocument.ts (Source mode / the plain
// editor tab) for the full rationale; this is the Rich-mode equivalent,
// keyed by path and process-lifetime only.
const unflushedBodies = new Map<string, string>();

export type MarkdownDocState =
  | { status: "loading" }
  | { status: "ready"; body: string; revision: number }
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string };

type Options = {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
};

export function useMarkdownDocument({ path, onDirtyChange }: Options) {
  const [doc, setDoc] = useState<MarkdownDocState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);

  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const autoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);

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

  const autoSaveRef = useRef({ autoSave, autoSaveDelay });
  autoSaveRef.current = { autoSave, autoSaveDelay };

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoSaveTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

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
          const unflushed = unflushedBodies.get(path);
          unflushedBodies.delete(path);
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
  }, [path]);

  // Applies the disk content. force=true is how a conflict is force-resolved
  // by discarding local edits (reloadFromDisk): it must apply even if the
  // disk content happens to equal what was last read, since the buffer's own
  // dirty body is what has to be replaced, not what replaceFromDisk compares
  // against.
  const performReload = useCallback((force = false): void => {
    void invoke<ReadResult>("fs_read_file", { path, workspace: currentWorkspaceEnv() })
      .then((res) => {
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
  // discarding them for the disk version.
  const reload = useCallback((): boolean => {
    if (dirtyRef.current) {
      setConflict(true);
      return false;
    }
    performReload();
    return true;
  }, [performReload]);

  const keepLocalChanges = useCallback(() => {
    setConflict(false);
  }, []);

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

      clearAutoSaveTimer();

      const { autoSave: active, autoSaveDelay: delay } = autoSaveRef.current;
      if (active && isDirty) {
        timeoutRef.current = setTimeout(() => {
          saveNow().catch((e) => {
            console.error("[autosave]", e);
            toast.error("Autosave failed", {
              description: e instanceof Error ? e.message : String(e),
            });
          });
        }, delay);
      }
    },
    [clearAutoSaveTimer, saveNow],
  );

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      const buf = bufferRef.current;
      if (buf?.isDirty()) {
        // Auto-save on: the preference already means "persist as things
        // happen", so this is the same safety net as before, just also
        // covering a pane move. Auto-save off: the user opted out of
        // unprompted disk writes, so the edit is carried in memory instead
        // and picked up if the same path mounts again (see unflushedBodies).
        if (autoSaveRef.current.autoSave) {
          saveNow().catch((e) => {
            console.error("[autosave flush]", e);
          });
        } else {
          unflushedBodies.set(path, buf.getBody());
        }
      }
    };
  }, [path, clearAutoSaveTimer, saveNow]);

  return { doc, dirty, conflict, keepLocalChanges, reloadFromDisk, onChange, setBaseline, save, reload };
}
