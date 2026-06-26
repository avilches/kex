import { BreadcrumbItem, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { PathBreadcrumb } from "@/modules/workspaces/pathbar/PathBreadcrumb";
import { buildEditorPathBreadcrumb } from "./lib/editorPathBreadcrumb";

type Props = {
  path: string;
  workspaceRoot: string | null;
  home: string | null;
  onRevealPath: (path: string) => void;
};

export function EditorPathBreadcrumb({
  path,
  workspaceRoot,
  home,
  onRevealPath,
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
