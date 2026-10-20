import { CommandItem, CommandShortcut } from "@/components/ui/command";
import { HugeiconsIcon } from "@hugeicons/react";
import { HighlightText } from "./HighlightText";
import type { RowHighlight } from "./lib/mergeRows";
import { RowTag } from "./RowTag";
import type { PaletteItem } from "./types";

export function ActionItem({
  item,
  highlight,
  shortcutLabel,
  onRun,
}: {
  item: PaletteItem;
  highlight?: RowHighlight;
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
      <span className="truncate">
        <HighlightText
          text={item.title}
          indices={highlight?.field === "title" ? highlight.indices : undefined}
        />
      </span>
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
