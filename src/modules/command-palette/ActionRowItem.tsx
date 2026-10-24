import { CommandItem } from "@/components/ui/command";
import { ActionIcon } from "@/modules/actions/ActionIcon";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import { HighlightText } from "./HighlightText";
import type { RowHighlight } from "./lib/mergeRows";
import { RowTag } from "./RowTag";

export function ActionRowItem({
  item,
  highlight,
  onRun,
  onContextMenu,
}: {
  item: BarItem;
  highlight?: RowHighlight;
  onRun: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <CommandItem
      value={`act:${item.id}`}
      onSelect={onRun}
      onContextMenu={onContextMenu}
      title={item.title ?? undefined}
      className="text-[12.5px]"
    >
      <RowTag kind="Action" />
      <span className="shrink-0 text-muted-foreground">
        <ActionIcon action={item.action} />
      </span>
      <span className="min-w-0 truncate">
        <HighlightText
          text={item.name}
          indices={highlight?.field === "title" ? highlight.indices : undefined}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {item.subtitle}
      </span>
      <span className="shrink-0 text-[10.5px] text-muted-foreground">
        {item.global ? "Global" : "Workspace"}
      </span>
    </CommandItem>
  );
}
