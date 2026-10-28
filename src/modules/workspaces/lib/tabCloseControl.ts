import { isHibernatedTab } from "./hibernate";
import type { Tab } from "./types";

export type TabEndButton = "hibernate" | "close";

// The buttons at the end of a tab. An awake terminal gets both, so it can be put to sleep or
// closed; anything else only closes.
export function tabEndButtons(tab: Tab): TabEndButton[] {
  return tab.kind === "terminal" && !isHibernatedTab(tab) ? ["hibernate", "close"] : ["close"];
}

// What a middle click does: an awake terminal goes to sleep first, and a second click closes it.
export function tabMiddleClick(tab: Tab): TabEndButton {
  return tab.kind === "terminal" && !isHibernatedTab(tab) ? "hibernate" : "close";
}
