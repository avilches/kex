import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { cn } from "@/lib/utils";
import { MarkdownPreviewPane } from "@/modules/markdown/MarkdownPreviewPane";
import { MarkdownDocFallback } from "@/modules/markdown/lib/MarkdownDocFallback";
import { OutlinePanel } from "@/modules/markdown/lib/OutlinePanel";
import { headingsFromMarkdown } from "@/modules/markdown/lib/outline";
import { nextViewMode } from "@/modules/markdown/lib/viewCycle";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { matchesShortcut } from "@/modules/shortcuts/shortcuts";
import type { TabCallbacks } from "@/modules/workspaces/TabContent";

type Props = {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
};

type ViewMode = "source" | "rich" | "preview";

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "source", label: "Source" },
  { mode: "rich", label: "Rich" },
  { mode: "preview", label: "Preview" },
];

export function MarkdownTab(props: Props): JSX.Element {
  const editorRef = useRef<CodeMirrorEditorHandle>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("rich");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [edit, setEdit] = useState<{ doc: unknown; text: string } | null>(null);
  const { workspaceRoot, home, gitRootPath } = useEditorChrome();

  const { doc, conflict, keepLocalChanges, reloadFromDisk, onChange, save, reload, recreate } =
    useDocument({
      path: props.path,
      tabId: props.tabId,
      onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
    });

  useBackgroundConflictToast(conflict, props.visible, props.path);

  // useDocument only republishes `doc` on load/reload, so the text the user has
  // typed since then is tracked here, tied to the doc it was typed against; a
  // reload swaps `doc` and the stale edit is ignored. Preview and Outline read
  // it, and a remounted editor starts from it.
  const liveContent = doc.status === "ready" ? (edit && edit.doc === doc ? edit.text : doc.content) : "";
  const handleChange = useCallback(
    (next: string) => {
      onChange(next);
      setEdit({ doc, text: next });
    },
    [onChange, doc],
  );
  const headings = useMemo(
    () => (outlineOpen && viewMode !== "preview" ? headingsFromMarkdown(liveContent) : []),
    [outlineOpen, viewMode, liveContent],
  );

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

  // The global editor.save handler only serves `editor` tabs, so a markdown tab
  // routes its own save key.
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (matchesShortcut(e.nativeEvent, "editor.cycleView", userShortcuts)) {
        e.preventDefault();
        setViewMode((m) => nextViewMode(VIEW_MODES.map((v) => v.mode), m));
        return;
      }
      if (!matchesShortcut(e.nativeEvent, "editor.save", userShortcuts)) return;
      e.preventDefault();
      saveRef.current().catch((err) =>
        toast.error("Save failed", { description: err instanceof Error ? err.message : String(err) }),
      );
    },
    [userShortcuts],
  );

  return (
    <div className="flex h-full w-full flex-col" onKeyDownCapture={handleKeyDown}>
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
        trailing={
          <>
            {viewMode !== "preview" && (
              <button
                type="button"
                title="Toggle outline"
                onClick={() => setOutlineOpen((v) => !v)}
                className={cn(
                  "flex size-[22px] items-center justify-center rounded outline-none transition-colors focus-visible:outline-none",
                  outlineOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-label="Outline"
                >
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
              </button>
            )}
            <div className="flex items-center overflow-hidden rounded border border-border/60 text-[11px]">
              {VIEW_MODES.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-2 py-0.5 outline-none transition-colors focus-visible:outline-none",
                    viewMode === mode ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        }
      />
      <div className="relative min-h-0 flex-1">
        {doc.status === "ready" && viewMode === "preview" ? (
          <MarkdownPreviewPane content={liveContent} />
        ) : doc.status === "ready" ? (
          <div className="flex h-full min-h-0">
            <div className="min-w-0 flex-1">
              <CodeMirrorEditor
                ref={editorRef}
                value={liveContent}
                syncKey={doc}
                onChange={handleChange}
                path={props.path}
                mode={viewMode === "source" ? "source" : "rich"}
              />
            </div>
            {outlineOpen && (
              <OutlinePanel
                headings={headings}
                onNavigate={(h) => editorRef.current?.scrollToLine(h.line)}
                onClose={() => setOutlineOpen(false)}
              />
            )}
          </div>
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
          // Narrowed to {binary}|{toolarge}|{error}, the states MarkdownDocFallback covers.
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
