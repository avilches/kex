import { type JSX, useEffect, useRef } from "react";
import { EditorPathBar, ReloadConflictOverlay, useBackgroundConflictToast } from "@/modules/editor";
import { useDocument } from "@/modules/editor/lib/useDocument";
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

  const { doc, conflict, keepLocalChanges, reloadFromDisk, onChange, save } = useDocument({
    path: props.path,
    tabId: props.tabId,
    onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
  });

  useBackgroundConflictToast(conflict, props.visible, props.path);

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
          <CodeMirrorEditor ref={editorRef} value={doc.content} onChange={onChange} />
        ) : doc.status === "loading" || doc.status === "deleted" ? null : (
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
