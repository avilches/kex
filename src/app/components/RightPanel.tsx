import { cn } from "@/lib/utils";
import { FileExplorer, type FileExplorerHandle } from "@/modules/explorer";
import { GitHistoryPane, type GitHistorySearchHandle } from "@/modules/git-history/GitHistoryPane";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setRightPanelActiveTab } from "@/modules/settings/store";
import { SourceControlPanel } from "@/modules/source-control";
import type { SourceControlSummary } from "@/modules/source-control";
import { forwardRef, useImperativeHandle, useRef } from "react";

export type RightPanelTab = "explorer" | "git" | "history";

export type RightPanelHandle = {
  focusExplorer: () => void;
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
  activeFilePath?: string | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
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
    }));

    return (
      <div className="flex h-full flex-col bg-card/40">
        {/* Tab strip */}
        <div className="flex h-8 shrink-0 items-center border-b border-border/60 bg-card/60">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => void setRightPanelActiveTab(tab.id)}
              className={cn(
                "h-full px-3 text-[11px] font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
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
              rootPath={props.rootPath}
              activeFilePath={props.activeFilePath}
              onOpenFile={props.onOpenFile}
              onPathRenamed={props.onPathRenamed}
              onPathDeleted={props.onPathDeleted}
              onRevealInTerminal={props.onRevealInTerminal}
              onAttachToAgent={props.onAttachToAgent}
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
              onOpenGitGraph={props.onOpenGitGraph}
              onOpenFile={props.onOpenFile}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              activeTab !== "history" && "invisible pointer-events-none",
            )}
          >
            <GitHistoryPane
              repoRoot={props.repoRoot}
              onOpenCommitFile={props.onOpenCommitFile}
              onSearchHandle={props.onSearchHandle}
            />
          </div>
        </div>
      </div>
    );
  },
);
