import { BreadcrumbItem, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { PathBreadcrumb } from "@/modules/workspaces/pathbar/PathBreadcrumb";
import { DirSegmentContextMenu } from "@/modules/workspaces/pathbar/DirSegmentContextMenu";
import { buildEditorPathBreadcrumb } from "./lib/editorPathBreadcrumb";

type Props = {
  path: string;
  workspaceRoot: string | null;
  home: string | null;
  gitRootPath?: string | null;
  onRevealPath: (path: string) => void;
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
        <BreadcrumbItem>
          <BreadcrumbPage className="whitespace-nowrap text-foreground">
            {fileName}
          </BreadcrumbPage>
        </BreadcrumbItem>
      }
    />
  );
}
