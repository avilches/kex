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
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setRightPanelActiveTab } from "@/modules/settings/store";
import { SourceControlPanel } from "@/modules/source-control";
import type { SourceControlSummary } from "@/modules/source-control";
import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";
import { GitCommitIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { forwardRef, useImperativeHandle, useRef } from "react";

export type RightPanelTab = "explorer" | "git" | "history";

export type RightPanelHandle = {
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

export type RightPanelProps = {
  // FileExplorer props
  rootPath: string | null;
  rootMode: ExplorerRootMode;
  onChangeRootMode: (mode: ExplorerRootMode) => void;
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
  activeFilePath?: string | null;
  revealRequest?: RevealRequest | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
  onExplorerSearchClose?: () => void;
  // SourceControlPanel props
  sourceControl: SourceControlSummary;
  onOpenDiff: (input: {
    path: string;
    repoRoot: string;
    mode: "+" | "-";
    originalPath: string | null;
    title?: string;
  }) => void;
  onOpenGitGraph?: () => void;
  // GitHistoryPane props
  repoRoot: string;
  onOpenCommitFile: (input: CommitFileDiffOpenInput) => void;
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void;
};

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: "explorer", label: "Explorer" },
  { id: "git", label: "Git" },
  { id: "history", label: "History" },
];

export const RightPanel = forwardRef<RightPanelHandle, RightPanelProps>(
  function RightPanel(props, ref) {
    const activeTab = usePreferencesStore((s) => s.rightPanelActiveTab);
    const explorerRef = useRef<FileExplorerHandle>(null);

    useImperativeHandle(ref, () => ({
      focusExplorer: () => explorerRef.current?.focusSearch?.(),
      toggleExplorerSearch: () => explorerRef.current?.toggleSearch?.(),
      isExplorerFocused: () => explorerRef.current?.isFocused() ?? false,
      refreshExplorer: (path: string) => explorerRef.current?.refresh(path),
    }));

    return (
      <div className="flex h-full flex-col bg-sidebar">
        {/* Tab strip */}
        <div className="flex h-8 shrink-0 items-center border-b border-border/60">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => void setRightPanelActiveTab(tab.id)}
              className={cn(
                "h-full px-3 text-[11px] font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-card text-foreground"
                  : "bg-muted/35 text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content — all three mounted, only active visible */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              activeTab !== "explorer" && "invisible pointer-events-none",
            )}
          >
            <FileExplorer
              ref={explorerRef}
              active={activeTab === "explorer"}
              rootPath={props.rootPath}
              rootMode={props.rootMode}
              onChangeRootMode={props.onChangeRootMode}
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
              activeFilePath={props.activeFilePath}
              revealRequest={props.revealRequest}
              onOpenFile={props.onOpenFile}
              onPathRenamed={props.onPathRenamed}
              onPathDeleted={props.onPathDeleted}
              onRevealInTerminal={props.onRevealInTerminal}
              onNewWorkspaceFromFolder={props.onNewWorkspaceFromFolder}
              onAddToGitignore={props.onAddToGitignore}
              gitStatus={props.sourceControl.status}
              onSearchClose={props.onExplorerSearchClose}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              activeTab !== "git" && "invisible pointer-events-none",
            )}
          >
            <SourceControlPanel
              open={activeTab === "git"}
              sourceControl={props.sourceControl}
              onOpenDiff={props.onOpenDiff}
              onOpenFile={props.onOpenFile}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 flex flex-col overflow-hidden",
              activeTab !== "history" && "invisible pointer-events-none",
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
