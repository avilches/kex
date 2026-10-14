import {
  AppWindowMacIcon,
  ComputerTerminal01Icon,
  GitCommitIcon,
  GitCompareIcon,
  GitGraphIcon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { pathBasename } from "@/lib/pathUtils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { defaultKindFor, FACTORY_TITLE_DEFAULTS, FALLBACK_TITLES } from "./defaultTitles";
import { expandTitle } from "./titleTemplate";
import { expandTabTitle, tabTitleVars, type TitleSources } from "./titleVars";
import type { Tab } from "./types";
import { getWorkspaceIcon } from "./workspaceIcon";

export function basename(path: string): string {
  return pathBasename(path, { tolerateTrailingSlash: true });
}

export function tabTitle(
  tab: Tab,
  runningCommand?: string | null,
  oscTitle?: string,
  sources?: TitleSources,
): string {
  const src: TitleSources = { ...sources, runningCommand, osc: oscTitle ?? sources?.osc };
  const custom = expandTabTitle(tab, src);
  if (custom) return custom;
  // A terminal counts as an agent tab when the sources name an agent.
  const hasAgent = tab.kind === "terminal" && !!src.agent;
  const template = (src.defaults ?? FACTORY_TITLE_DEFAULTS)[defaultKindFor(tab, hasAgent)];
  const expanded = expandTitle(template, tabTitleVars(tab, src));
  if (expanded) return expanded;
  switch (tab.kind) {
    case "terminal":
      return FALLBACK_TITLES.terminal;
    case "browser":
      return FALLBACK_TITLES.browser;
    case "git-history":
      return FALLBACK_TITLES.gitHistory;
    default:
      return basename(tab.path);
  }
}

const TAB_ICONS: Record<Exclude<Tab["kind"], "editor" | "markdown">, IconSvgElement> = {
  terminal: ComputerTerminal01Icon,
  browser: Globe02Icon,
  "git-diff": GitCompareIcon,
  "git-history": GitGraphIcon,
  "git-commit-file": GitCommitIcon,
};

export function tabIcon(tab: Tab, running = false): ReactNode {
  const custom = tab.icon ? getWorkspaceIcon(tab.icon) : null;
  if (custom) return <HugeiconsIcon icon={custom} size={13} strokeWidth={2} />;
  if (tab.kind === "editor" || tab.kind === "markdown") {
    return <img src={fileIconUrl(basename(tab.path))} alt="" className="size-3.5 shrink-0" />;
  }
  const icon = tab.kind === "terminal" && running ? AppWindowMacIcon : TAB_ICONS[tab.kind];
  return <HugeiconsIcon icon={icon} size={13} strokeWidth={2} />;
}
