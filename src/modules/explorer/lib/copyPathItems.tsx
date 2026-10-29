import {
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { CopySlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { cn } from "@/lib/utils";
import { pathDirname } from "@/lib/pathUtils";
import { useLogicalRepoRoot } from "./useLogicalRepoRoot";
import { StartTrimmed } from "@/components/StartTrimmed";
import { copyToClipboard } from "./contextActions";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./menuItemClass";
import { pathCopyOptions, type PathCopyBases, type PathCopyOption } from "./pathCopyOptions";

function Sub({ text }: { text: string }) {
  return <StartTrimmed text={text} className="flex max-w-[240px] text-[10px] text-muted-foreground" />;
}

function Shortcut({ id }: { id: ShortcutId }) {
  const label = useShortcutLabel(id);
  return label ? <ContextMenuShortcut>{label}</ContextMenuShortcut> : null;
}

export function CopyAbsolutePathItem({
  path,
  compact = true,
  shortcut,
}: {
  path: string;
  compact?: boolean;
  shortcut?: ShortcutId;
}) {
  return (
    <ContextMenuItem
      className={compact ? COMPACT_ITEM : undefined}
      onSelect={() => void copyToClipboard(path, "Copied absolute path")}
    >
      <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center">
          Copy Absolute Path
          {shortcut && <Shortcut id={shortcut} />}
        </span>
        <Sub text={path} />
      </span>
    </ContextMenuItem>
  );
}

function CopyOptionItem({
  option,
  shortcut,
  compact,
}: {
  option: PathCopyOption;
  shortcut?: ShortcutId;
  compact: boolean;
}) {
  return (
    <ContextMenuItem
      className={compact ? COMPACT_ITEM : undefined}
      onSelect={() => void copyToClipboard(option.text, option.toast)}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center">
          {option.label}
          {shortcut && <Shortcut id={shortcut} />}
        </span>
        <Sub text={option.text} />
      </span>
    </ContextMenuItem>
  );
}

// "Copy Path" with one entry per base the path can be copied against. With only the absolute
// path to offer it is the plain "Copy Absolute Path" item, no submenu.
export function CopyPathMenu({
  path,
  isDir,
  workspaceRoot,
  repoRoot,
  relativeRoot,
  compact = true,
  shortcut,
}: {
  path: string;
  isDir: boolean;
  workspaceRoot: string | null;
  // Undefined looks the repository up (cached, and only while the menu is open); null or a path is taken as known.
  repoRoot?: string | null;
  relativeRoot?: string | null;
  compact?: boolean;
  shortcut?: ShortcutId;
}) {
  const asked = useLogicalRepoRoot(repoRoot === undefined ? (isDir ? path : pathDirname(path)) : undefined);
  const bases: PathCopyBases = {
    workspaceRoot,
    repoRoot: repoRoot === undefined ? asked : repoRoot,
    relativeRoot,
  };
  const options = pathCopyOptions(path, bases);
  if (options.length === 1) return <CopyAbsolutePathItem path={path} compact={compact} shortcut={shortcut} />;
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className={cn("gap-2", compact && COMPACT_ITEM)}>
        <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
        Copy Path
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className={COMPACT_CONTENT}>
        {options.map((option) => (
          <CopyOptionItem
            key={option.kind}
            option={option}
            compact={compact}
            shortcut={option.kind === "absolute" ? shortcut : undefined}
          />
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
