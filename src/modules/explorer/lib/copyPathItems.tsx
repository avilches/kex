import { ContextMenuItem, ContextMenuShortcut } from "@/components/ui/context-menu";
import { Link01Icon, CopySlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { StartTrimmed } from "@/components/StartTrimmed";
import { copyToClipboard } from "./contextActions";
import { COMPACT_ITEM } from "./menuItemClass";
import { relativeCopyFor } from "./relativeCopy";

function Sub({ text }: { text: string }) {
  return <StartTrimmed text={text} className="flex max-w-[240px] text-[10px] text-muted-foreground" />;
}

function Shortcut({ id }: { id: ShortcutId }) {
  const label = useShortcutLabel(id);
  return label ? <ContextMenuShortcut>{label}</ContextMenuShortcut> : null;
}

export function CopyRelativePathItem({
  path,
  workspaceRoot,
  compact = true,
}: {
  path: string;
  workspaceRoot: string | null;
  compact?: boolean;
}) {
  const rel = relativeCopyFor(path, workspaceRoot);
  if (rel.ok && rel.text === ".") return null;
  return (
    <ContextMenuItem
      className={compact ? COMPACT_ITEM : undefined}
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

// For callers that already hold the relative path (wiki links, source control).
export function CopyRelativeTextItem({ text }: { text: string }) {
  if (text === ".") return null;
  return (
    <ContextMenuItem
      className={COMPACT_ITEM}
      onSelect={() => void copyToClipboard(text, "Copied relative path")}
    >
      <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
      <span className="flex min-w-0 flex-col">
        <span>Copy Relative Path</span>
        <Sub text={text} />
      </span>
    </ContextMenuItem>
  );
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
