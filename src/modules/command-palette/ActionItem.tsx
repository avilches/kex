import { CommandItem, CommandShortcut } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { RowTag } from "./RowTag";
import type { PaletteItem } from "./types";

export function ActionItem({
  item,
  shortcutLabel,
  onRun,
}: {
  item: PaletteItem;
  shortcutLabel: string | null;
  onRun: () => void;
}) {
  const rightLabel = item.disabledReason ?? item.trailing ?? shortcutLabel;
  return (
    <CommandItem
      value={`cmd:${item.id}`}
      disabled={!!item.disabledReason}
      onSelect={onRun}
      className="text-[12.5px]"
    >
      <RowTag kind={item.group === "Settings" ? "Setting" : "Action"} />
      {item.icon ? (
        <HugeiconsIcon
          icon={item.icon}
          size={14}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
      ) : null}
      <span className="truncate">{item.title}</span>
      {rightLabel ? (
        <CommandShortcut
          className={item.disabledReason ? "normal-case tracking-normal" : ""}
        >
          {rightLabel}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  );
}
