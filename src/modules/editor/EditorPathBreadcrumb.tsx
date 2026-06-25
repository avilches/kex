import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { FolderPinIcon, Home03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import {
  buildEditorPathBreadcrumb,
  type EditorSegmentRelation,
} from "./lib/editorPathBreadcrumb";

type Props = {
  path: string;
  workspaceRoot: string | null;
  home: string | null;
  onRevealPath: (path: string) => void;
};

const RELATION_CLASS: Record<EditorSegmentRelation, string> = {
  "above-root": "text-muted-foreground/60 hover:text-foreground",
  root: "text-foreground",
  "inside-root": "text-muted-foreground hover:text-foreground",
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
    <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap gap-1 text-[11px] sm:gap-1">
          {segments.map((s) => (
            <Fragment key={s.fullPath}>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    onClick={() => onRevealPath(s.fullPath)}
                    title={s.fullPath}
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1 whitespace-nowrap",
                        RELATION_CLASS[s.relation],
                      )}
                    >
                      {s.isHome ? (
                        <HugeiconsIcon
                          icon={Home03Icon}
                          className="size-3"
                          strokeWidth={1.75}
                        />
                      ) : s.relation === "root" ? (
                        <HugeiconsIcon
                          icon={FolderPinIcon}
                          className="size-3"
                          strokeWidth={1.75}
                        />
                      ) : null}
                      {s.isHome ? "Home" : s.label}
                    </Badge>
                  </button>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="[&>svg]:size-3" />
            </Fragment>
          ))}
          <BreadcrumbItem>
            <BreadcrumbPage className="whitespace-nowrap text-foreground">
              {fileName}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
