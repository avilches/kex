import { CommandGroup } from "@/components/ui/command";
import { type KeyBinding, type ShortcutId, getShortcutLabel } from "@/modules/shortcuts";
import { ActionItem } from "./ActionItem";
import { COMMAND_GROUPS } from "./commands";
import type { MergedRow } from "./lib/mergeRows";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { TabItem } from "./TabItem";
import type { PaletteItem } from "./types";
import { WorkspaceItem } from "./WorkspaceItem";

type Props = {
  rows: MergedRow[];
  typing: boolean;
  ambiguous: ReadonlySet<string>;
  userShortcuts: Record<ShortcutId, KeyBinding[]>;
  onRunCommand: (item: PaletteItem) => void;
  onRunTab: (entry: TabEntry) => void;
  onRunWorkspace: (entry: WorkspaceEntry) => void;
};

function shortcutLabel(id: ShortcutId | undefined, user: Record<ShortcutId, KeyBinding[]>): string | null {
  return id ? getShortcutLabel(id, user) : null;
}

function Row({ row, p }: { row: MergedRow; p: Props }) {
  if (row.kind === "tab") {
    return <TabItem entry={row.entry} ambiguous={p.ambiguous.has(row.entry.tabId)} onRun={() => p.onRunTab(row.entry)} />;
  }
  if (row.kind === "workspace") {
    return <WorkspaceItem entry={row.entry} onRun={() => p.onRunWorkspace(row.entry)} />;
  }
  return (
    <ActionItem
      item={row.item}
      shortcutLabel={shortcutLabel(row.item.shortcutId, p.userShortcuts)}
      onRun={() => p.onRunCommand(row.item)}
    />
  );
}

// Typing: one flat list in rank order, so the best match is the first row whatever it is.
// Empty box: recent tabs, then the actions under their fixed groups.
export function MergedList(p: Props) {
  if (p.typing) {
    return (
      <CommandGroup>
        {p.rows.map((row) => (
          <Row key={row.key} row={row} p={p} />
        ))}
      </CommandGroup>
    );
  }
  const tabs = p.rows.filter((r) => r.kind === "tab");
  const actions = p.rows.filter((r): r is Extract<MergedRow, { kind: "command" }> => r.kind === "command");
  return (
    <>
      {tabs.length > 0 ? (
        <CommandGroup heading="Recent tabs">
          {tabs.map((row) => (
            <Row key={row.key} row={row} p={p} />
          ))}
        </CommandGroup>
      ) : null}
      {COMMAND_GROUPS.map((group) => {
        const inGroup = actions.filter((r) => r.item.group === group);
        if (inGroup.length === 0) return null;
        return (
          <CommandGroup key={group} heading={group}>
            {inGroup.map((row) => (
              <Row key={row.key} row={row} p={p} />
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}
