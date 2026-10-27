import { CommandGroup } from "@/components/ui/command";
import {
  getShortcutLabel,
  type KeyBinding,
  type ShortcutId,
} from "@/modules/shortcuts";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import { ActionItem } from "./ActionItem";
import { ActionRowItem } from "./ActionRowItem";
import { ClosedItem } from "./ClosedItem";
import { COMMAND_GROUPS } from "./commands";
import type { ClosedTabEntry } from "./lib/closedEntries";
import type { MergedRow } from "./lib/mergeRows";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { TabItem } from "./TabItem";
import type { PaletteItem } from "./types";
import { WorkspaceItem } from "./WorkspaceItem";

type Props = {
  rows: MergedRow[];
  typing: boolean;
  term: string;
  userShortcuts: Record<ShortcutId, KeyBinding[]>;
  onRunCommand: (item: PaletteItem) => void;
  onRunTab: (entry: TabEntry) => void;
  onRunWorkspace: (entry: WorkspaceEntry) => void;
  onRunClosed: (entry: ClosedTabEntry) => void;
  onRunAction: (item: BarItem) => void;
  onContextMenuAction?: (item: BarItem, e: React.MouseEvent<HTMLElement>) => void;
  onContextMenuWorkspace?: (entry: WorkspaceEntry, e: React.MouseEvent<HTMLElement>) => void;
  onContextMenuTab?: (entry: TabEntry, e: React.MouseEvent<HTMLElement>) => void;
  onContextMenuClosed?: (entry: ClosedTabEntry, e: React.MouseEvent<HTMLElement>) => void;
};

function shortcutLabel(
  id: ShortcutId | undefined,
  user: Record<ShortcutId, KeyBinding[]>,
): string | null {
  return id ? getShortcutLabel(id, user) : null;
}

function Row({ row, p }: { row: MergedRow; p: Props }) {
  if (row.kind === "action") {
    return (
      <ActionRowItem
        item={row.item}
        highlight={row.highlight}
        onRun={() => p.onRunAction(row.item)}
        onContextMenu={
          p.onContextMenuAction ? (e) => p.onContextMenuAction?.(row.item, e) : undefined
        }
      />
    );
  }
  if (row.kind === "tab") {
    return (
      <TabItem
        entry={row.entry}
        highlight={row.highlight}
        term={p.term}
        onRun={() => p.onRunTab(row.entry)}
        onContextMenu={
          p.onContextMenuTab ? (e) => p.onContextMenuTab?.(row.entry, e) : undefined
        }
      />
    );
  }
  if (row.kind === "workspace") {
    return (
      <WorkspaceItem
        entry={row.entry}
        highlight={row.highlight}
        onRun={() => p.onRunWorkspace(row.entry)}
        onContextMenu={
          p.onContextMenuWorkspace
            ? (e) => p.onContextMenuWorkspace?.(row.entry, e)
            : undefined
        }
      />
    );
  }
  if (row.kind === "closed") {
    return (
      <ClosedItem
        entry={row.entry}
        term={p.term}
        onRun={() => p.onRunClosed(row.entry)}
        onContextMenu={
          p.onContextMenuClosed ? (e) => p.onContextMenuClosed?.(row.entry, e) : undefined
        }
      />
    );
  }
  return (
    <ActionItem
      item={row.item}
      highlight={row.highlight}
      shortcutLabel={shortcutLabel(row.item.shortcutId, p.userShortcuts)}
      onRun={() => p.onRunCommand(row.item)}
    />
  );
}

// Typing: the current tab, then the other matching tabs in the order of the empty list, then the rest
// ranked by score, all in one flat list.
// Empty box: recent tabs, then the actions under their fixed groups.
export function MergedList(p: Props) {
  const isCurrent = (r: MergedRow) => r.kind === "tab" && r.current === true;
  const currentRows = p.rows.filter(isCurrent);
  const current =
    currentRows.length > 0 ? (
      <CommandGroup heading="Current tab">
        {currentRows.map((row) => (
          <Row key={row.key} row={row} p={p} />
        ))}
      </CommandGroup>
    ) : null;
  if (p.typing) {
    const ranked = p.rows.filter((r) => !isCurrent(r));
    return (
      <>
        {current}
        {ranked.length > 0 ? (
          <CommandGroup>
            {ranked.map((row) => (
              <Row key={row.key} row={row} p={p} />
            ))}
          </CommandGroup>
        ) : null}
      </>
    );
  }
  const tabs = p.rows.filter((r) => r.kind === "tab" && !r.current);
  const closed = p.rows.filter((r) => r.kind === "closed");
  const userActions = p.rows.filter(
    (r): r is Extract<MergedRow, { kind: "action" }> => r.kind === "action",
  );
  const workspaceActions = userActions.filter((r) => !r.item.global);
  const globalActions = userActions.filter((r) => r.item.global);
  const actions = p.rows.filter(
    (r): r is Extract<MergedRow, { kind: "command" }> => r.kind === "command",
  );
  return (
    <>
      {current}
      {tabs.length > 0 ? (
        <CommandGroup heading="Recent tabs">
          {tabs.map((row) => (
            <Row key={row.key} row={row} p={p} />
          ))}
        </CommandGroup>
      ) : null}
      {closed.length > 0 ? (
        <CommandGroup heading="Recently closed">
          {closed.map((row) => (
            <Row key={row.key} row={row} p={p} />
          ))}
        </CommandGroup>
      ) : null}
      {workspaceActions.length > 0 ? (
        <CommandGroup heading="Workspace actions">
          {workspaceActions.map((row) => (
            <Row key={row.key} row={row} p={p} />
          ))}
        </CommandGroup>
      ) : null}
      {globalActions.length > 0 ? (
        <CommandGroup heading="Global actions">
          {globalActions.map((row) => (
            <Row key={row.key} row={row} p={p} />
          ))}
        </CommandGroup>
      ) : null}
      {COMMAND_GROUPS.map((group) => {
        const inGroup = actions.filter((r) => r.item.group === group);
        if (inGroup.length === 0) return null;
        return (
          <CommandGroup key={group} heading={`${group} actions`}>
            {inGroup.map((row) => (
              <Row key={row.key} row={row} p={p} />
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}
