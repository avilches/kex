import type { Editor } from "@tiptap/core";
import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EditorPathBar } from "@/modules/editor";
import { EditorPane, type EditorPaneHandle } from "@/modules/editor/EditorPane";
import { useMarkdownDocument } from "@/modules/markdown/lib/useMarkdownDocument";
import {
  buildWikiLinkIndex,
  type WikiLinkEntry,
} from "@/modules/markdown/lib/wikiLinks";
import { OutlinePanel } from "@/modules/markdown/rich/OutlinePanel";
import {
  RichMarkdownEditor,
  type RichMarkdownEditorHandle,
} from "@/modules/markdown/rich/RichMarkdownEditor";
import { Toolbar } from "@/modules/markdown/rich/Toolbar";
import {
  createMenuStore,
  type MenuStore,
} from "@/modules/markdown/rich/lib/menuStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { matchesShortcut } from "@/modules/shortcuts/shortcuts";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";
import type { TabCallbacks } from "@/modules/workspaces/TabContent";

type Props = {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
};

// Mirrors EditorPane's formatting so the non-editable fallbacks read identically.
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function toDescription(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function MarkdownTab(props: Props): JSX.Element {
  const [mode, setMode] = useState<"rich" | "source">("rich");
  const [findOpen, setFindOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const tick = useMemo<MenuStore<number>>(() => createMenuStore(0), []);
  const richRef = useRef<RichMarkdownEditorHandle>(null);
  const editorPaneRef = useRef<EditorPaneHandle>(null);

  const { workspaceRoot, home, gitRootPath } = useEditorChrome();
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  // Task 17 replaces this literal with usePreferencesStore((s) => s.markdownWikiLinks).
  const wikiLinksEnabled = false as boolean;

  const { doc, onChange, save, reload } = useMarkdownDocument({
    path: props.path,
    onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
  });

  // Own the wiki-link index at the tab level so RichMarkdownEditor's first parse
  // already resolves link targets (see RichMarkdownEditor wikiEntries prop).
  const [wikiEntries, setWikiEntries] = useState<WikiLinkEntry[]>([]);
  useEffect(() => {
    if (!wikiLinksEnabled || !workspaceRoot) {
      setWikiEntries([]);
      return;
    }
    let cancelled = false;
    buildWikiLinkIndex(workspaceRoot)
      .then((entries) => {
        if (!cancelled) setWikiEntries(entries);
      })
      .catch((e) => console.error("Failed to load wiki-link index:", e));
    return () => {
      cancelled = true;
    };
  }, [wikiLinksEnabled, workspaceRoot]);

  const handleNavigateFile = useCallback(
    (target: string) => {
      props.callbacks.onFocusOnExplorer?.(target);
    },
    [props.callbacks],
  );

  const toggleMode = useCallback(async () => {
    if (mode === "rich") {
      const md = richRef.current?.serialize();
      if (md != null) onChange(md);
      try {
        await save();
      } catch (e) {
        toast.error("Could not switch mode", { description: toDescription(e) });
        return;
      }
      setMode("source");
    } else {
      try {
        await editorPaneRef.current?.save();
      } catch (e) {
        toast.error("Could not switch mode", { description: toDescription(e) });
        return;
      }
      reload();
      setMode("rich");
    }
  }, [mode, onChange, save, reload]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (matchesShortcut(e.nativeEvent, "editor.save", userShortcuts)) {
        e.preventDefault();
        if (mode === "rich") {
          const md = richRef.current?.serialize();
          if (md != null) onChange(md);
          save().catch((err) =>
            toast.error("Save failed", { description: toDescription(err) }),
          );
        } else {
          editorPaneRef.current
            ?.save()
            .catch((err) =>
              toast.error("Save failed", { description: toDescription(err) }),
            );
        }
      } else if (
        matchesShortcut(e.nativeEvent, "markdown.toggleSource", userShortcuts)
      ) {
        e.preventDefault();
        void toggleMode();
      } else if (
        matchesShortcut(e.nativeEvent, "markdown.toggleOutline", userShortcuts)
      ) {
        e.preventDefault();
        setOutlineOpen((v) => !v);
      } else if (
        mode === "rich" &&
        matchesShortcut(e.nativeEvent, "search.focus", userShortcuts)
      ) {
        e.preventDefault();
        setFindOpen(true);
      }
    },
    [mode, userShortcuts, onChange, save, toggleMode],
  );

  const segment = (target: "rich" | "source", label: string): JSX.Element => (
    <button
      type="button"
      onClick={() => {
        if (mode !== target) void toggleMode();
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
          title="Find"
          onClick={() => setFindOpen((v) => !v)}
          className="flex size-[22px] items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:outline-none"
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      )}
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

  const richContent = (): JSX.Element | null => {
    if (doc.status === "loading") return null;
    if (doc.status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
          {doc.message}
        </div>
      );
    }
    if (doc.status === "binary" || doc.status === "toolarge") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">
            {doc.status === "binary" ? "Binary file" : "File too large"}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} · preview not supported
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Toolbar
          editor={editor}
          tick={tick}
          onOpenMathInsert={(k) => richRef.current?.openMathInsert(k)}
        />
        <div className="flex min-h-0 flex-1">
          <RichMarkdownEditor
            ref={richRef}
            body={doc.body}
            revision={doc.revision}
            filePath={props.path}
            workspaceRoot={workspaceRoot}
            wikiLinksEnabled={wikiLinksEnabled}
            wikiEntries={wikiEntries}
            tick={tick}
            onEditorChange={setEditor}
            onChangeMarkdown={onChange}
            onNavigateFile={handleNavigateFile}
            findOpen={findOpen}
            onCloseFind={() => setFindOpen(false)}
          />
          {outlineOpen && (
            <OutlinePanel
              editor={editor}
              tick={tick}
              onClose={() => setOutlineOpen(false)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: capture-phase key routing for editor shortcuts, not an interactive widget
    <div
      className="flex h-full w-full flex-col"
      onKeyDownCapture={handleKeyDown}
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
        ) : (
          richContent()
        )}
      </div>
    </div>
  );
}
