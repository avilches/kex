import {
  ComputerTerminal01Icon,
  GitCommitIcon,
  GitCompareIcon,
  GitGraphIcon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import type { Tab } from "./types";

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function tabTitle(tab: Tab, runningCommand?: string | null, oscTitle?: string): string {
  if (tab.kind !== "terminal" && tab.title) return tab.title;
  switch (tab.kind) {
    case "terminal": {
      if (tab.title) return tab.title;
      if (runningCommand) return basename(runningCommand.trim().split(/\s+/)[0] ?? "");
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
): string {
  if (!hasAgent || tab.kind !== "terminal") return fallbackTitle;
  if (tab.title) return tab.title;
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

export function tabIcon(tab: Tab, _workspaceId?: string): ReactNode {
  if (tab.kind === "editor" || tab.kind === "markdown") {
    return <img src={fileIconUrl(basename(tab.path))} alt="" className="size-3.5 shrink-0" />;
  }
  return <HugeiconsIcon icon={TAB_ICONS[tab.kind]} size={13} strokeWidth={2} />;
}
