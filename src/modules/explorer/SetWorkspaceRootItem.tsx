import { ContextMenuItem } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { COMPACT_ITEM } from "./lib/menuItemClass";

type Props = {
  path: string;
  workspaceRoot: string | null;
  onSetAsRoot: (path: string) => void;
  disabled?: boolean;
  label?: string;
};

// The way to a workspace root: highlighted while the workspace has none, dimmed once it does.
export function SetWorkspaceRootItem({
  path,
  workspaceRoot,
  onSetAsRoot,
  disabled,
  label = "Set as Workspace Root",
}: Props) {
  const missing = workspaceRoot === null;
  return (
    <ContextMenuItem
      className={cn(
        COMPACT_ITEM,
        missing ? "font-medium text-primary focus:text-primary" : "opacity-60",
      )}
      disabled={disabled}
      onSelect={() => onSetAsRoot(path)}
    >
      <HugeiconsIcon
        icon={PinIcon}
        size={14}
        strokeWidth={2}
        className={cn(missing && "text-primary")}
      />
      {label}
    </ContextMenuItem>
  );
}
