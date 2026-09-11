import { type JSX, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EditorPathBar } from "@/modules/editor";
import { EditorPane, type EditorPaneHandle } from "@/modules/editor/EditorPane";
import { MarkdownDocFallback } from "@/modules/markdown/lib/MarkdownDocFallback";
import { useMarkdownTabController } from "@/modules/markdown/lib/useMarkdownTabController";
import {
  MilkdownEditor,
  type MilkdownEditorHandle,
} from "@/modules/markdown/milkdown/MilkdownEditor";
import { OutlinePanel } from "@/modules/markdown/milkdown/OutlinePanel";
import type { OutlineHeading } from "@/modules/markdown/milkdown/outline";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";
import type { TabCallbacks } from "@/modules/workspaces/TabContent";

type Props = {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
};

export function MilkdownTab(props: Props): JSX.Element {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const milkRef = useRef<MilkdownEditorHandle>(null);
  const editorPaneRef = useRef<EditorPaneHandle>(null);

  const { workspaceRoot, home, gitRootPath } = useEditorChrome();

  const ctrl = useMarkdownTabController({
    path: props.path,
    onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
    serializeRich: () => milkRef.current?.serialize() ?? null,
    saveSource: async () => {
      await editorPaneRef.current?.save();
    },
    onToggleOutline: () => setOutlineOpen((v) => !v),
  });
  const { mode, doc, onChange, setBaseline } = ctrl;

  // Record what the freshly loaded document serializes to, before the user can touch it.
  // The round trip normalizes formatting, so without this every save path (Cmd+S, the
  // autosave timer, the unmount flush) would rewrite a file nobody edited.
  const readyRevision = doc.status === "ready" ? doc.revision : null;
  useEffect(() => {
    if (mode !== "rich" || readyRevision === null) return;
    const md = milkRef.current?.serialize();
    if (md != null) setBaseline(md);
  }, [readyRevision, mode, setBaseline]);

  const segment = (target: "rich" | "source", label: string): JSX.Element => (
    <button
      type="button"
      onClick={() => {
        if (mode !== target) void ctrl.toggleMode();
      }}
      className={cn(
        "px-2 py-0.5 outline-none transition-colors focus-visible:outline-none",
        mode === target
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  const trailing = (
    <>
      {mode === "rich" && (
        <button
          type="button"
          title="Toggle outline"
          onClick={() => setOutlineOpen((v) => !v)}
          className={cn(
            "flex size-[22px] items-center justify-center rounded outline-none transition-colors focus-visible:outline-none",
            outlineOpen
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
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
        {segment("rich", "Rich")}
        {segment("source", "Source")}
      </div>
    </>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: capture-phase key routing for editor shortcuts, not an interactive widget
    <div
      className="flex h-full w-full flex-col"
      onKeyDownCapture={(e) => {
        if (ctrl.handleShortcut(e.nativeEvent)) e.preventDefault();
      }}
    >
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
        trailing={trailing}
      />
      <div className="relative min-h-0 flex-1">
        {mode === "source" ? (
          <EditorPane
            ref={editorPaneRef}
            path={props.path}
            onDirtyChange={(d) =>
              props.callbacks.onEditorDirtyChange?.(props.tabId, d)
            }
          />
        ) : initError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12.5px] text-muted-foreground">
            <span>Milkdown could not open this document: {initError}</span>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                setInitError(null);
                void ctrl.toggleMode();
              }}
            >
              Open in Source mode
            </button>
          </div>
        ) : doc.status === "ready" ? (
          <div className="flex h-full min-h-0">
            <MilkdownEditor
              ref={milkRef}
              body={doc.body}
              revision={doc.revision}
              onChangeMarkdown={onChange}
              onHeadingsChange={setHeadings}
              onInitError={setInitError}
            />
            {outlineOpen && (
              <OutlinePanel
                headings={headings}
                onNavigate={(id) => milkRef.current?.scrollToHeading(id)}
                onClose={() => setOutlineOpen(false)}
              />
            )}
          </div>
        ) : (
          <MarkdownDocFallback doc={doc} />
        )}
      </div>
    </div>
  );
}
