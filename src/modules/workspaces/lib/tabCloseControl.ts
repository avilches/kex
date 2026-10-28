import { isHibernatedTab } from "./hibernate";
import type { Tab } from "./types";

// What the button at the end of a tab and a middle click on it do. An awake terminal is closed in two steps, so its
// button hibernates; the close button only shows once the tab sleeps. Other kinds close at once.
export type TabCloseControl = "close" | "hibernate";

export function tabCloseControl(tab: Tab): TabCloseControl {
  return tab.kind === "terminal" && !isHibernatedTab(tab) ? "hibernate" : "close";
}
