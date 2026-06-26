import { BreadcrumbItem, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { pathDirname } from "@/lib/pathUtils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { PathBreadcrumb } from "@/modules/workspaces/pathbar/PathBreadcrumb";
import { DirSegmentContextMenu } from "@/modules/workspaces/pathbar/DirSegmentContextMenu";
import { FileLeafContextMenu } from "@/modules/workspaces/pathbar/FileLeafContextMenu";
import { buildEditorPathBreadcrumb } from "./lib/editorPathBreadcrumb";

type Props = {
  path: string;
  workspaceRoot: string | null;
  home: string | null;
  gitRootPath?: string | null;
  onRevealPath: (path: string) => void;
  onFocusOnExplorer?: (
    path: string,
    action?: "rename" | "duplicate" | "delete",
  ) => void;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function EditorPathBreadcrumb({
  path,
  workspaceRoot,
  home,
  gitRootPath,
  onRevealPath,
  onFocusOnExplorer,
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

  const fileIcon = fileIconUrl(fileName);
  const leafNode = (
    <BreadcrumbItem>
      <BreadcrumbPage className="flex items-center gap-1 whitespace-nowrap text-foreground">
        {fileIcon ? (
          <img src={fileIcon} alt="" className="size-4 shrink-0" />
        ) : null}
        {fileName}
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
          rootPath={workspaceRoot ?? seg.fullPath}
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
        onFocusOnExplorer ? (
          <FileLeafContextMenu
            path={path}
            rootPath={workspaceRoot ?? pathDirname(path)}
            gitRootPath={gitRootPath ?? null}
            onFocusOnExplorer={onFocusOnExplorer}
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
