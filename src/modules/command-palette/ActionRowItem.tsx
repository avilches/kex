import { CommandItem } from "@/components/ui/command";
import { ActionIcon } from "@/modules/actions/ActionIcon";
import { splitActionName } from "@/modules/actions/lib/actionName";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import { HighlightText } from "./HighlightText";
import type { RowHighlight } from "./lib/mergeRows";
import { RowTag } from "./RowTag";

export function ActionRowItem({
  item,
  highlight,
  tagHit,
  onRun,
  onContextMenu,
}: {
  item: BarItem;
  highlight?: RowHighlight;
  tagHit?: number;
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
      <RowTag kind="Action" hit={tagHit} />
      <span className="shrink-0 text-muted-foreground">
        <ActionIcon action={item.action} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate">
          <HighlightText
            text={splitActionName(item.name).main}
            indices={highlight?.field === "title" ? highlight.indices : undefined}
          />
        </span>
        {item.subtitle ? (
          <span className="truncate font-mono text-[10.5px] font-normal text-muted-foreground/80">
            <HighlightText
              text={item.subtitle}
              indices={highlight?.field === "detail" ? highlight.indices : undefined}
            />
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[10.5px] text-muted-foreground">
        {item.global ? "Global" : "Workspace"}
      </span>
    </CommandItem>
  );
}
