import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MarkdownDocumentBuffer } from "@/modules/markdown/lib/documentBuffer";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { currentWorkspaceEnv } from "@/modules/workspace";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

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

  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const autoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);

  const bufferRef = useRef<MarkdownDocumentBuffer | null>(null);
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

    invoke<ReadResult>("fs_read_file", { path, workspace: currentWorkspaceEnv() })
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          bufferRef.current = new MarkdownDocumentBuffer(res.content);
          revisionRef.current = 0;
          setDoc({
            status: "ready",
            body: bufferRef.current.getBody(),
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

  // Skipped while dirty (never clobber unsaved edits) and when disk already
  // matches the buffer (self-save / duplicate watcher event -> no re-render).
  const reload = useCallback((): boolean => {
    if (dirtyRef.current) return false;
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
          if (!buf.replaceFromDisk(res.content)) return;
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
    return true;
  }, [path]);

  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

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

  const save = useCallback(async () => {
    clearAutoSaveTimer();
    const buf = bufferRef.current;
    if (!buf?.isDirty()) return;
    await saveNow();
  }, [clearAutoSaveTimer, saveNow]);

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
        saveNow().catch((e) => {
          console.error("[autosave flush]", e);
        });
      }
    };
  }, [path, clearAutoSaveTimer, saveNow]);

  return { doc, dirty, onChange, save, reload };
}
