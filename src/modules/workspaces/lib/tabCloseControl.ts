import { isHibernatedTab } from "./hibernate";
import type { Tab } from "./types";

export type TabMiddleClick = "hibernate" | "close";

// What a middle click does: an awake terminal goes to sleep first, and a second click closes it.
export function tabMiddleClick(tab: Tab): TabMiddleClick {
  return tab.kind === "terminal" && !isHibernatedTab(tab) ? "hibernate" : "close";
}
