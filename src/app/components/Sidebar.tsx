import { cn } from "@/lib/utils";
import {
  FileExplorer,
  type FileExplorerHandle,
  type RevealRequest,
  revealForWorkspace,
} from "@/modules/explorer";
import type { RevealAction } from "@/modules/explorer/lib/pendingAction";
import {
  GitHistoryPane,
  type GitHistorySearchHandle,
} from "@/modules/git-history/GitHistoryPane";
import { NotesView } from "@/modules/notes";
import type {
  SourceControlPanelHandle,
  SourceControlSummary,
} from "@/modules/source-control";
import { SourceControlPanel } from "@/modules/source-control";
import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";
import type { ExplorerSnapshot } from "@/modules/workspaces/lib/sidebarSnapshot";
import {
  effectiveSidebarView,
  type SidebarView,
} from "@/modules/workspaces/lib/sidebarState";
import {
  FolderOpenIcon,
  GitBranchIcon,
  GitCommitIcon,
  HierarchyFilesIcon,
  Note01Icon,
  PinIcon,
  PinOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type SidebarHandle = {
  focusExplorer: () => void;
  toggleExplorerSearch: () => void;
  isExplorerFocused: () => boolean;
  refreshExplorer: (path: string) => void;
  navigateGitDiffEntry: (
    input: { repoRoot: string; path: string; mode: "-" | "+" },
    direction: "prev" | "next",
  ) => { path: string; originalPath: string | null; mode: "-" | "+" } | null;
};

type CommitFileDiffOpenInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
  pin: boolean;
};

export type SidebarProps = {
  // Sidebar chrome (per-window)
  view: SidebarView;
  onChangeView: (view: SidebarView) => void;
  notesRoot: string | null;
  onOpenNoteToSide: (path: string) => void;
  onRevealNoteInExplorer: (path: string) => void;
  workspaceId: string | null;
  initialExplorer?: ExplorerSnapshot | null;
  onExplorerSnapshot?: (snapshot: ExplorerSnapshot) => void;
  // FileExplorer props
  rootPath: string | null;
  rootMode: ExplorerRootMode;
  onChangeRootMode: (mode: ExplorerRootMode) => void;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onFocusActiveTab?: () => void;
  onSetAsRoot: (path: string) => void;
  onEnterFolder?: (path: string) => void;
  onNavigateUp?: () => void;
  onFsRootMissing?: (path: string) => void;
  canNavigateUp: boolean;
  homePath: string | null;
  gitRootPath: string | null;
  workspaceRootPath: string | null;
  revealRequest?: RevealRequest | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
  onPickWorkspaceRoot?: () => void;
  onExplorerSearchClose?: () => void;
  openFiles: ReadonlySet<string>;
  // SourceControlPanel props
  workspaceCwd: string | null;
  sourceControl: SourceControlSummary;
  pushOnCommit: boolean;
  onPushOnCommitChange: (enabled: boolean) => void;
  gitWorkspaceId: string | null;
  savedCommitMessage: string;
  onCommitMessagePersist: (workspaceId: string, message: string) => void;
  onOpenDiff: (
    input: {
      path: string;
      repoRoot: string;
      mode: "+" | "-";
      originalPath: string | null;
      title?: string;
    },
    pin: boolean,
  ) => void;
  onOpenGitGraph?: () => void;
  onNavigateToWorktree?: (path: string) => void;
  onFocusOnExplorer?: (path: string, action?: RevealAction) => void;
  // GitHistoryPane props
  repoRoot: string;
  onOpenCommitFile: (input: CommitFileDiffOpenInput) => void;
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void;
};

type StripTab = "root" | "explorer" | "git" | "notes";

const STRIP_ICONS = {
  root: PinIcon,
  explorer: HierarchyFilesIcon,
  git: GitBranchIcon,
  notes: Note01Icon,
} as const;

const STRIP_LABELS: Record<StripTab, string> = {
  root: "Workspace",
  explorer: "Explorer",
  git: "Git",
  notes: "Notes",
};

export const Sidebar = forwardRef<SidebarHandle, SidebarProps>(
  function Sidebar(props, ref) {
    const view = effectiveSidebarView(props.view, props.notesRoot);
    const hasRoot = props.workspaceRootPath !== null;
    // Without a root the Workspace Root tab shows an invitation instead of the explorer, and
    // that choice belongs to the workspace it was made in.
    const [promptFor, setPromptFor] = useState<string | null>(null);
    const rootPrompt =
      !hasRoot &&
      view === "explorer" &&
      (props.rootMode === "workspace" || promptFor === (props.workspaceId ?? "none"));
    useEffect(() => {
      if (view !== "explorer" || hasRoot) setPromptFor(null);
    }, [view, hasRoot]);

    const strip: StripTab[] = props.notesRoot
      ? ["root", "explorer", "git", "notes"]
      : ["root", "explorer", "git"];
    const selected: StripTab =
      view === "explorer"
        ? rootPrompt || props.rootMode === "workspace"
          ? "root"
          : "explorer"
        : view === "git"
          ? "git"
          : view === "notes"
            ? "notes"
            : "explorer";

    const selectTab = (tab: StripTab) => {
      if (tab === "root") {
        if (!hasRoot) {
          setPromptFor(props.workspaceId ?? "none");
          props.onChangeView("explorer");
          return;
        }
        setPromptFor(null);
        props.onChangeView("explorer");
        props.onChangeRootMode("workspace");
        return;
      }
      setPromptFor(null);
      if (tab === "explorer") {
        props.onChangeView("explorer");
        props.onChangeRootMode("filesystem");
        return;
      }
      props.onChangeView(tab);
    };
    const explorerRef = useRef<FileExplorerHandle>(null);
    const sourceControlRef = useRef<SourceControlPanelHandle>(null);

    useImperativeHandle(ref, () => ({
      focusExplorer: () => explorerRef.current?.focusSearch?.(),
      toggleExplorerSearch: () => explorerRef.current?.toggleSearch?.(),
      isExplorerFocused: () => explorerRef.current?.isFocused() ?? false,
      refreshExplorer: (path: string) => explorerRef.current?.refresh(path),
      navigateGitDiffEntry: (input, direction) =>
        sourceControlRef.current?.navigateEntry(input, direction) ?? null,
    }));

    return (
      <div className="flex h-full flex-col bg-sidebar">
        {/* View strip */}
        <div
          className="flex h-8 shrink-0 items-center border-b border-border/60"
          role="tablist"
          aria-label="Sidebar views"
        >
          {strip.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected === tab}
              onClick={() => selectTab(tab)}
              title={
                tab === "root" && !hasRoot
                  ? "Workspace Root (not set yet)"
                  : tab === "root"
                    ? "Workspace Root"
                    : STRIP_LABELS[tab]
              }
              className={cn(
                "relative flex h-full items-center gap-1.5 px-3 text-[11px] font-medium transition-colors",
                tab === "root" && !hasRoot && "border-[1.5px] border-dashed border-muted-foreground/40",
                selected === tab
                  ? "bg-card text-foreground"
                  : "bg-muted/35 text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {selected === tab && (
                <div className="absolute inset-x-0 top-0 h-[1.5px] bg-tab-focus-indicator" />
              )}
              <HugeiconsIcon
                icon={tab === "root" && !hasRoot ? PinOffIcon : STRIP_ICONS[tab]}
                size={12}
                strokeWidth={2}
              />
              <span className={cn(tab === "root" && !hasRoot && "opacity-50")}>
                {STRIP_LABELS[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Content -- four panes; Notes is only mounted when notesRoot is set, the others always are */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              view !== "explorer" && "invisible pointer-events-none",
            )}
          >
            <FileExplorer
              key={props.workspaceId ?? "none"}
              ref={explorerRef}
              initialExplorer={props.initialExplorer}
              onExplorerSnapshot={props.onExplorerSnapshot}
              active={view === "explorer"}
              rootPath={props.rootPath}
              rootMode={props.rootMode}
              onChangeRootMode={props.onChangeRootMode}
              showHidden={props.showHidden}
              onToggleShowHidden={props.onToggleShowHidden}
              onFocusActiveTab={props.onFocusActiveTab}
              onSetAsRoot={props.onSetAsRoot}
              onEnterFolder={props.onEnterFolder}
              onNavigateUp={props.onNavigateUp}
              onFsRootMissing={props.onFsRootMissing}
              canNavigateUp={props.canNavigateUp}
              homePath={props.homePath}
              gitRootPath={props.gitRootPath}
              workspaceRootPath={props.workspaceRootPath}
              revealRequest={revealForWorkspace(
                props.revealRequest,
                props.workspaceId,
              )}
              onOpenFile={props.onOpenFile}
              onPathRenamed={props.onPathRenamed}
              onRevealInTerminal={props.onRevealInTerminal}
              onNewWorkspaceFromFolder={props.onNewWorkspaceFromFolder}
              onAddToGitignore={props.onAddToGitignore}
              gitStatus={props.sourceControl.status}
              onSearchClose={props.onExplorerSearchClose}
              openFiles={props.openFiles}
            />
          </div>
          {rootPrompt && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-sidebar px-4 py-10 text-center">
              <HugeiconsIcon
                icon={PinOffIcon}
                size={26}
                strokeWidth={1.8}
                className="text-muted-foreground"
              />
              <div className="text-sm font-medium text-foreground">
                No workspace root set
              </div>
              <div className="text-[11px] text-muted-foreground">
                The root is the folder this workspace belongs to. Pick it to see its files here and
                to use everything that depends on it.
              </div>
              <div className="mt-2 flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={props.onPickWorkspaceRoot}
                  className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-card"
                >
                  <HugeiconsIcon
                    icon={FolderOpenIcon}
                    size={14}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0 text-primary"
                  />
                  <span className="font-medium">Choose a folder...</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectTab("explorer")}
                  className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-card"
                >
                  <HugeiconsIcon
                    icon={HierarchyFilesIcon}
                    size={14}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0 text-primary"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">Pick it in the Explorer</span>
                    <span className="text-[10px] text-muted-foreground">
                      Right-click a folder and choose Set as Workspace Root
                    </span>
                  </span>
                </button>
              </div>
            </div>
          )}
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              view !== "git" && "invisible pointer-events-none",
            )}
          >
            <SourceControlPanel
              ref={sourceControlRef}
              open={view === "git"}
              sourceControl={props.sourceControl}
              pushOnCommit={props.pushOnCommit}
              onPushOnCommitChange={props.onPushOnCommitChange}
              gitWorkspaceId={props.gitWorkspaceId}
              savedCommitMessage={props.savedCommitMessage}
              onCommitMessagePersist={props.onCommitMessagePersist}
              onOpenDiff={props.onOpenDiff}
              onOpenFile={props.onOpenFile}
              onNavigateToWorktree={props.onNavigateToWorktree}
              onFocusOnExplorer={props.onFocusOnExplorer}
              workspaceCwd={props.workspaceCwd}
              workspaceRoot={props.workspaceRootPath}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 flex flex-col overflow-hidden",
              view !== "history" && "invisible pointer-events-none",
            )}
          >
            {props.onOpenGitGraph ? (
              <div className="flex h-8 shrink-0 items-center justify-end border-b border-border/60 px-1.5">
                <button
                  type="button"
                  title="Open in tab"
                  onClick={props.onOpenGitGraph}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon
                    icon={GitCommitIcon}
                    size={14}
                    strokeWidth={1.85}
                  />
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto">
              <GitHistoryPane
                repoRoot={props.repoRoot}
                onOpenCommitFile={props.onOpenCommitFile}
                onSearchHandle={props.onSearchHandle}
              />
            </div>
          </div>
          {props.notesRoot ? (
            <div
              className={cn(
                "absolute inset-0 overflow-hidden",
                view !== "notes" && "invisible pointer-events-none",
              )}
            >
              <NotesView
                root={props.notesRoot}
                active={view === "notes"}
                onOpenFile={props.onOpenFile}
                onOpenToSide={props.onOpenNoteToSide}
                onRevealInExplorer={props.onRevealNoteInExplorer}
                onPathRenamed={props.onPathRenamed ?? (() => {})}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);
