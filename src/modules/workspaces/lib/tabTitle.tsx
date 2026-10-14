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
import { expandTabTitle, type TitleSources } from "./titleVars";
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
  const custom = expandTabTitle(tab, { ...sources, runningCommand });
  if (tab.kind !== "terminal" && custom) return custom;
  switch (tab.kind) {
    case "terminal": {
      if (custom) return custom;
      if (runningCommand) return runningCommand.trim().replace(/\s+/g, " ");
      if (oscTitle) return oscTitle;
      if (!tab.cwd) return "shell";
      const cwd = tab.cwd.replace(/\/$/, "");
      if (!cwd) return "shell";
      const parts = cwd.split(/[\\/]/).filter(Boolean);
      if (parts.length === 0) return cwd;
      const prefix = /^[\\/]/.test(cwd) ? "/" : "";
      if (parts.length <= 2) return prefix + parts.join("/");
      return "…/" + parts.slice(-2).join("/");
    }
    case "editor":          return basename(tab.path);
    case "browser":         return tab.url || "Browser";
    case "markdown":        return basename(tab.path);
    case "git-diff":        return basename(tab.path);
    case "git-history":     return "Git History";
    case "git-commit-file": return basename(tab.path);
  }
}

export function agentAwareTabTitle(
  tab: Tab,
  hasAgent: boolean,
  agentName: string | undefined,
  oscTitle: string | undefined,
  sessionTitle: string | undefined,
  fallbackTitle: string,
  customTitle?: string,
): string {
  if (!hasAgent || tab.kind !== "terminal") return fallbackTitle;
  const custom = customTitle ?? tab.title;
  if (custom) return custom;
  if (oscTitle) return oscTitle;
  if (sessionTitle) return sessionTitle;
  const cwd = tab.cwd ?? "";
  const dirname = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
  return `${agentName} · ${dirname || fallbackTitle}`;
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
