import { ContextMenuItem } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { COMPACT_ITEM } from "./lib/menuItemClass";

export const MISSING_ROOT_ITEM = "font-medium text-primary focus:text-primary";

type Props = {
  path: string;
  workspaceRoot: string | null;
  onSetAsRoot: (path: string) => void;
  disabled?: boolean;
  label?: string;
  place: "top" | "end";
};

// The way to a workspace root: first and highlighted while the workspace has none (place "top"), last of its block once it has one (place "end").
export function SetWorkspaceRootItem({
  path,
  workspaceRoot,
  onSetAsRoot,
  disabled,
  label = "Set as Workspace Root",
  place,
}: Props) {
  const missing = workspaceRoot === null;
  if ((place === "top") !== missing) return null;
  return (
    <ContextMenuItem
      className={cn(COMPACT_ITEM, missing && MISSING_ROOT_ITEM)}
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
