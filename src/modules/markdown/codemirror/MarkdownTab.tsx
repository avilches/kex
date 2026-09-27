import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { type JSX, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pathBasename } from "@/lib/pathUtils";
import { EditorPathBar, ReloadConflictOverlay, useBackgroundConflictToast } from "@/modules/editor";
import { useDocument } from "@/modules/editor/lib/useDocument";
import { listenFsChanged, parentDir, watchAdd, watchRemove } from "@/modules/explorer/lib/watch";
import {
  CodeMirrorEditor,
  type CodeMirrorEditorHandle,
} from "@/modules/markdown/codemirror/CodeMirrorEditor";
import { MarkdownDocFallback } from "@/modules/markdown/lib/MarkdownDocFallback";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";
import type { TabCallbacks } from "@/modules/workspaces/TabContent";

type Props = {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
};

export function MarkdownTab(props: Props): JSX.Element {
  const editorRef = useRef<CodeMirrorEditorHandle>(null);
  const { workspaceRoot, home, gitRootPath } = useEditorChrome();

  const { doc, conflict, keepLocalChanges, reloadFromDisk, onChange, save, reload, recreate } =
    useDocument({
      path: props.path,
      tabId: props.tabId,
      onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
    });

  useBackgroundConflictToast(conflict, props.visible, props.path);

  const path = props.path;
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // Same external-change wiring as useMarkdownDocument: fs:file-written only
  // catches another Kex tab/window saving this path (our own saves are tagged
  // source: "editor"); real external edits arrive on fs:changed from the
  // native watcher on the parent directory.
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

  const saveRef = useRef(save);
  saveRef.current = save;
  const registerMarkdownSaveHandlerRef = useRef(props.callbacks.registerMarkdownSaveHandler);
  registerMarkdownSaveHandlerRef.current = props.callbacks.registerMarkdownSaveHandler;
  useEffect(() => {
    registerMarkdownSaveHandlerRef.current?.(props.tabId, () => saveRef.current());
    return () => registerMarkdownSaveHandlerRef.current?.(props.tabId, null);
  }, [props.tabId]);

  useEffect(() => {
    if (props.focused) editorRef.current?.focus();
  }, [props.focused]);

  return (
    <div className="flex h-full w-full flex-col">
      <EditorPathBar
        path={props.path}
        tabId={props.tabId}
        workspaceRoot={workspaceRoot}
        home={home}
        gitRootPath={gitRootPath}
        onRevealPath={(p) => props.callbacks.onFocusOnExplorer?.(p)}
        onFocusOnExplorer={props.callbacks.onFocusOnExplorer}
        onRenameFile={props.callbacks.onRenameFile}
        onSetAsRoot={props.callbacks.onSetAsRoot}
        onNewWorkspaceFromFolder={props.callbacks.onNewWorkspaceFromFolder}
        onRevealInTerminal={props.callbacks.onRevealInTerminal}
        onAddToGitignore={props.callbacks.onAddToGitignore}
      />
      <div className="relative min-h-0 flex-1">
        {doc.status === "ready" ? (
          <CodeMirrorEditor
            ref={editorRef}
            value={doc.content}
            syncKey={doc}
            onChange={onChange}
          />
        ) : doc.status === "loading" ? null : doc.status === "deleted" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="text-sm text-foreground">This file was deleted from disk</div>
            <div className="max-w-sm text-xs text-muted-foreground">
              {pathBasename(props.path)} no longer exists at its original location. Its last
              known content is still kept in this tab.
            </div>
            <div className="mt-1 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.callbacks.onEditorClose?.(props.tabId)}
              >
                Close tab
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  recreate().catch((e) => {
                    toast.error("Could not recreate file", {
                      description: e instanceof Error ? e.message : String(e),
                    });
                  });
                }}
              >
                Save to recreate file
              </Button>
            </div>
          </div>
        ) : (
          // MarkdownDocFallback is typed for MarkdownDocState (useMarkdownDocument's
          // 5-variant union), not DocumentState (useDocument's 6-variant union, used
          // here). Excluding "ready"/"loading"/"deleted" above narrows doc to exactly
          // {binary}|{toolarge}|{error}, which today happens to match those variants'
          // shapes in MarkdownDocState field-for-field, so this type-checks. If either
          // union's shape for those three variants ever diverges, this breaks at
          // compile time, not silently.
          <MarkdownDocFallback doc={doc} />
        )}
        {conflict && (
          <ReloadConflictOverlay
            path={props.path}
            onKeep={keepLocalChanges}
            onReload={reloadFromDisk}
          />
        )}
      </div>
    </div>
  );
}
