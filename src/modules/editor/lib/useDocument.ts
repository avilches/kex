import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { usePreferencesStore } from "@/modules/settings/preferences";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

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
  onDirtyChange?: (dirty: boolean) => void;
};

export function useDocument({ path, onDirtyChange }: Options) {
  const [doc, setDoc] = useState<DocumentState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);

  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const autoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);

  // Track the saved buffer so we can detect changes cheaply.
  const savedRef = useRef<string>("");
  const bufferRef = useRef<string>("");
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const autoSaveRef = useRef({ autoSave, autoSaveDelay });
  autoSaveRef.current = { autoSave, autoSaveDelay };

  const docStatusRef = useRef<DocumentState["status"]>("loading");
  docStatusRef.current = doc.status;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoSaveTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

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
  useEffect(() => {
    let cancelled = false;
    setDoc({ status: "loading" });
    setDirty(false);

    invoke<ReadResult>("fs_read_file", { path, workspace: currentWorkspaceEnv() })
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          savedRef.current = res.content;
          bufferRef.current = res.content;
          setDoc({
            status: "ready",
            content: res.content,
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
  }, [path]);

  // Content sync is skipped while dirty (never clobber unsaved edits) and when
  // disk already matches the buffer (self-save / duplicate watcher event -> no
  // re-render). The deletion check below still runs while dirty: an edit in
  // progress must not hide that its file was removed out from under it, or
  // autosave would go on to silently recreate it.
  const reload = useCallback((): boolean => {
    const wasDirty = dirtyRef.current;
    void invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    })
      .then((res) => {
        if (wasDirty) return;
        if (res.kind === "text") {
          if (res.content === savedRef.current) return;
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
            if (!wasDirty) setDoc({ status: "error", message: String(e) });
            return;
          }
          setDoc({ status: "deleted" });
        });
      });
    return true;
  }, [path]);

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

  const onChange = useCallback(
    (next: string) => {
      bufferRef.current = next;
      const isDirty = next !== savedRef.current;
      setDirty(isDirty);

      clearAutoSaveTimer();

      const { autoSave: active, autoSaveDelay: delay } = autoSaveRef.current;
      if (active && isDirty && docStatusRef.current !== "deleted") {
        timeoutRef.current = setTimeout(() => {
          if (docStatusRef.current === "deleted") return;
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
      if (docStatusRef.current !== "deleted" && bufferRef.current !== savedRef.current) {
        saveNow().catch((e) => {
          console.error("[autosave flush]", e);
        });
      }
    };
  }, [path, clearAutoSaveTimer, saveNow]);

  return { doc, dirty, onChange, save, reload, recreate };
}
