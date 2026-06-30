import { cn } from "@/lib/utils";
import {
  FileExplorer,
  type FileExplorerHandle,
  type RevealRequest,
} from "@/modules/explorer";
import {
  GitHistoryPane,
  type GitHistorySearchHandle,
} from "@/modules/git-history/GitHistoryPane";
import { SourceControlPanel } from "@/modules/source-control";
import type { SourceControlSummary } from "@/modules/source-control";
import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";
import type { SidebarView } from "@/modules/workspaces/lib/sidebarState";
import { GitCommitIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { forwardRef, useImperativeHandle, useRef } from "react";

export type SidebarHandle = {
  focusExplorer: () => void;
  toggleExplorerSearch: () => void;
  isExplorerFocused: () => boolean;
  refreshExplorer: (path: string) => void;
};

type CommitFileDiffOpenInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

export type SidebarProps = {
  // Sidebar chrome (per-window)
  view: SidebarView;
  onChangeView: (view: SidebarView) => void;
  // FileExplorer props
  rootPath: string | null;
  rootMode: ExplorerRootMode;
  onChangeRootMode: (mode: ExplorerRootMode) => void;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onSetAsRoot: (path: string) => void;
  onEnterFolder?: (path: string) => void;
  onNavigateUp?: () => void;
  onFsRootMissing?: (path: string) => void;
  canNavigateUp: boolean;
  homePath: string | null;
  fsRootPath: string | null;
  gitRootPath: string | null;
  workspaceRootPath: string | null;
  workspaceRootExists: boolean;
  revealRequest?: RevealRequest | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
  onOpenWorkspaceProperties?: () => void;
  onExplorerSearchClose?: () => void;
  // SourceControlPanel props
  workspaceCwd: string | null;
  sourceControl: SourceControlSummary;
  pushOnCommit: boolean;
  onPushOnCommitChange: (enabled: boolean) => void;
  gitWorkspaceId: string | null;
  savedCommitMessage: string;
  onCommitMessagePersist: (workspaceId: string, message: string) => void;
  onOpenDiff: (input: {
    path: string;
    repoRoot: string;
    mode: "+" | "-";
    originalPath: string | null;
    title?: string;
  }) => void;
  onOpenGitGraph?: () => void;
  onNavigateToWorktree?: (path: string) => void;
  // GitHistoryPane props
  repoRoot: string;
  onOpenCommitFile: (input: CommitFileDiffOpenInput) => void;
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void;
};

const VIEWS: { id: SidebarView; label: string }[] = [
  { id: "explorer", label: "Explorer" },
  { id: "git", label: "Git" },
  { id: "history", label: "History" },
];

export const Sidebar = forwardRef<SidebarHandle, SidebarProps>(
  function Sidebar(props, ref) {
    const view = props.view;
    const explorerRef = useRef<FileExplorerHandle>(null);

    useImperativeHandle(ref, () => ({
      focusExplorer: () => explorerRef.current?.focusSearch?.(),
      toggleExplorerSearch: () => explorerRef.current?.toggleSearch?.(),
      isExplorerFocused: () => explorerRef.current?.isFocused() ?? false,
      refreshExplorer: (path: string) => explorerRef.current?.refresh(path),
    }));

    return (
      <div className="flex h-full flex-col bg-sidebar">
        {/* View strip */}
        <div className="flex h-8 shrink-0 items-center border-b border-border/60">
          {VIEWS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => props.onChangeView(tab.id)}
              className={cn(
                "relative h-full px-3 text-[11px] font-medium transition-colors",
                view === tab.id
                  ? "bg-card text-foreground"
                  : "bg-muted/35 text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {view === tab.id && (
                <div className="absolute inset-x-0 top-0 h-[1.5px] bg-tab-focus-indicator" />
              )}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content -- all three mounted, only active visible */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              view !== "explorer" && "invisible pointer-events-none",
            )}
          >
            <FileExplorer
              ref={explorerRef}
              active={view === "explorer"}
              rootPath={props.rootPath}
              rootMode={props.rootMode}
              onChangeRootMode={props.onChangeRootMode}
              showHidden={props.showHidden}
              onToggleShowHidden={props.onToggleShowHidden}
              onSetAsRoot={props.onSetAsRoot}
              onEnterFolder={props.onEnterFolder}
              onNavigateUp={props.onNavigateUp}
              onFsRootMissing={props.onFsRootMissing}
              canNavigateUp={props.canNavigateUp}
              homePath={props.homePath}
              fsRootPath={props.fsRootPath}
              gitRootPath={props.gitRootPath}
              workspaceRootPath={props.workspaceRootPath}
              workspaceRootExists={props.workspaceRootExists}
              revealRequest={props.revealRequest}
              onOpenFile={props.onOpenFile}
              onPathRenamed={props.onPathRenamed}
              onPathDeleted={props.onPathDeleted}
              onRevealInTerminal={props.onRevealInTerminal}
              onNewWorkspaceFromFolder={props.onNewWorkspaceFromFolder}
              onAddToGitignore={props.onAddToGitignore}
              onOpenWorkspaceProperties={props.onOpenWorkspaceProperties}
              gitStatus={props.sourceControl.status}
              onSearchClose={props.onExplorerSearchClose}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              view !== "git" && "invisible pointer-events-none",
            )}
          >
            <SourceControlPanel
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
              workspaceCwd={props.workspaceCwd}
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
                  title="Open in panel"
                  onClick={props.onOpenGitGraph}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon icon={GitCommitIcon} size={14} strokeWidth={1.85} />
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
        </div>
      </div>
    );
  },
);
