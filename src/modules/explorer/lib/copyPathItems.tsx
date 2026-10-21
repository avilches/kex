import { ContextMenuItem, ContextMenuShortcut } from "@/components/ui/context-menu";
import { Link01Icon, CopySlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { copyToClipboard } from "./contextActions";
import { COMPACT_ITEM } from "./menuItemClass";
import { relativeCopyFor } from "./relativeCopy";

const SUBPATH_CLASS = "block max-w-[240px] truncate text-left text-[10px] text-muted-foreground";

// The row is right-to-left so the ellipsis eats the start of a long path and keeps its
// tail, while text-left keeps a short one flush with the label; the inner ltr run stops the
// bidi algorithm from moving the leading slash.
function Sub({ text }: { text: string }) {
  return (
    <span className={SUBPATH_CLASS} dir="rtl" title={text}>
      <bdo dir="ltr">{text}</bdo>
    </span>
  );
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
      <span className="flex min-w-0 flex-col">
        <span>Copy Absolute Path</span>
        <Sub text={path} />
      </span>
      {shortcut && <Shortcut id={shortcut} />}
    </ContextMenuItem>
  );
}
