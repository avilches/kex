import { BreadcrumbItem, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { InlineInput } from "@/modules/explorer/InlineInput";
import { PathBreadcrumb } from "@/modules/workspaces/pathbar/PathBreadcrumb";
import { DirSegmentContextMenu } from "@/modules/workspaces/pathbar/DirSegmentContextMenu";
import { FileLeafContextMenu } from "@/modules/workspaces/pathbar/FileLeafContextMenu";
import { useFileRenameStore } from "@/modules/workspaces/lib/fileRenameStore";
import { buildEditorPathBreadcrumb } from "./lib/editorPathBreadcrumb";

type Props = {
  path: string;
  tabId?: string;
  workspaceRoot: string | null;
  home: string | null;
  gitRootPath?: string | null;
  onRevealPath: (path: string) => void;
  onFocusOnExplorer?: (
    path: string,
    action?: "rename" | "duplicate" | "delete",
  ) => void;
  onRenameFile?: (tabId: string, newName: string) => void;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function EditorPathBreadcrumb({
  path,
  tabId,
  workspaceRoot,
  home,
  gitRootPath,
  onRevealPath,
  onFocusOnExplorer,
  onRenameFile,
  onSetAsRoot,
  onNewWorkspaceFromFolder,
  onRevealInTerminal,
  onAddToGitignore,
}: Props) {
  const { segments, fileName } = buildEditorPathBreadcrumb(
    path,
    workspaceRoot,
    home,
  );

  // Inline rename of the filename leaf, mirroring the explorer sidebar. The
  // shared store is the single source of truth: F2 (file.rename) and the leaf
  // context-menu "Rename" both target this panel; the input commits via
  // onRenameFile (same path as renaming from the tab).
  const renameEnabled = !!tabId && !!onRenameFile;
  const editing = useFileRenameStore((s) => s.triggerTabId === tabId);
  const clearTrigger = useFileRenameStore((s) => s.clearTrigger);
  const startRename = useFileRenameStore((s) => s.trigger);
  const isEditing = renameEnabled && editing;

  const commitRename = (value: string) => {
    clearTrigger();
    const trimmed = value.trim();
    if (!trimmed || trimmed === fileName) return;
    if (tabId && onRenameFile) onRenameFile(tabId, trimmed);
  };

  const fileIcon = fileIconUrl(fileName);
  const leafContent = (
    <>
      {fileIcon ? (
        <img src={fileIcon} alt="" className="size-4 shrink-0" />
      ) : null}
      {fileName}
    </>
  );
  // The filename leaf reveals the file in the sidebar on click, same as a
  // directory segment or autofocus. Falls back to a static page with no handler.
  const leafNode = onFocusOnExplorer ? (
    <BreadcrumbItem>
      <button
        type="button"
        onClick={() => onFocusOnExplorer(path)}
        title={path}
        className="flex items-center gap-1 whitespace-nowrap text-foreground transition-opacity hover:opacity-80"
      >
        {leafContent}
      </button>
    </BreadcrumbItem>
  ) : (
    <BreadcrumbItem>
      <BreadcrumbPage className="flex items-center gap-1 whitespace-nowrap text-foreground">
        {leafContent}
      </BreadcrumbPage>
    </BreadcrumbItem>
  );

  return (
    <PathBreadcrumb
      segments={segments}
      onRevealPath={onRevealPath}
      renderSegment={(seg, trigger) => (
        <DirSegmentContextMenu
          path={seg.fullPath}
          workspaceRoot={workspaceRoot}
          gitRootPath={gitRootPath ?? null}
          onSetAsRoot={onSetAsRoot}
          onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
          onRevealInTerminal={onRevealInTerminal}
          onAddToGitignore={onAddToGitignore}
        >
          {trigger}
        </DirSegmentContextMenu>
      )}
      trailing={
        isEditing ? (
          <BreadcrumbItem>
            <div className="flex min-w-[12rem] items-center">
              <InlineInput
                initial={fileName}
                onCommit={commitRename}
                onCancel={clearTrigger}
              />
            </div>
          </BreadcrumbItem>
        ) : onFocusOnExplorer ? (
          <FileLeafContextMenu
            path={path}
            workspaceRoot={workspaceRoot}
            gitRootPath={gitRootPath ?? null}
            onFocusOnExplorer={onFocusOnExplorer}
            onRename={
              renameEnabled && tabId
                ? () => startRename(tabId)
                : undefined
            }
            onAddToGitignore={onAddToGitignore}
          >
            {leafNode}
          </FileLeafContextMenu>
        ) : (
          leafNode
        )
      }
    />
  );
}
