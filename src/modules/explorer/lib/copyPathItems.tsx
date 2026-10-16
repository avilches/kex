import { ContextMenuItem } from "@/components/ui/context-menu";
import { Link01Icon, CopySlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { copyToClipboard } from "./contextActions";
import { COMPACT_ITEM } from "./menuItemClass";
import { relativeCopyFor } from "./relativeCopy";

const SUBPATH_CLASS = "max-w-[240px] truncate text-[10px] text-muted-foreground";

function Sub({ text }: { text: string }) {
  return (
    <span className={SUBPATH_CLASS} title={text}>
      {text}
    </span>
  );
}

export function CopyRelativePathItem({
  path,
  workspaceRoot,
}: {
  path: string;
  workspaceRoot: string | null;
}) {
  const rel = relativeCopyFor(path, workspaceRoot);
  return (
    <ContextMenuItem
      className={COMPACT_ITEM}
      disabled={!rel.ok}
      onSelect={() => {
        if (rel.ok) void copyToClipboard(rel.text, "Copied relative path");
      }}
    >
      <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
      <span className="flex min-w-0 flex-col">
        <span>Copy Relative Path</span>
        <Sub text={rel.ok ? rel.text : rel.reason} />
      </span>
    </ContextMenuItem>
  );
}

export function CopyAbsolutePathItem({ path }: { path: string }) {
  return (
    <ContextMenuItem
      className={COMPACT_ITEM}
      onSelect={() => void copyToClipboard(path, "Copied absolute path")}
    >
      <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
      <span className="flex min-w-0 flex-col">
        <span>Copy Absolute Path</span>
        <Sub text={path} />
      </span>
    </ContextMenuItem>
  );
}
