import type { TabEntry } from "@/modules/command-palette";
import { useSidebarTabMenu } from "@/modules/workspaces/SidebarTabMenuContext";
import { TabContextMenuItems } from "@/modules/workspaces/TabContextMenuItems";
import type { Tab } from "@/modules/workspaces/lib/types";

// The menu of a tab in the pane strip, as the tab switcher shows it on a right click, minus Close Other
// Tabs. `tab` is the live tab, not the snapshot the tile was built from, so Lock and Note flip in place.
export function SwitcherTabMenu({
  entry,
  tab,
  onActivate,
}: {
  entry: TabEntry;
  tab: Tab;
  onActivate: (tabId: string) => void;
}) {
  const actions = useSidebarTabMenu();
  return (
    <TabContextMenuItems
      tab={tab}
      workspaceId={entry.workspaceId}
      paneTabCount={actions.paneTabCount(tab.id)}
      renameOrigin="pane"
      activateOnRename
      onActivate={onActivate}
      onClose={actions.onClose}
      onUpdateTab={actions.onUpdateTab}
    />
  );
}
