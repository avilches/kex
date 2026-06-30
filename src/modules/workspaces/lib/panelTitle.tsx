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
import type { Panel } from "./types";

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function panelTitle(panel: Panel, runningCommand?: string | null, oscTitle?: string): string {
  if (panel.kind !== "terminal" && panel.title) return panel.title;
  switch (panel.kind) {
    case "terminal": {
      if (panel.title) return panel.title;
      if (runningCommand) return basename(runningCommand.trim().split(/\s+/)[0] ?? "");
      if (oscTitle) return oscTitle;
      if (!panel.cwd) return "shell";
      const cwd = panel.cwd.replace(/\/$/, "");
      if (!cwd) return "shell";
      const parts = cwd.split(/[\\/]/).filter(Boolean);
      if (parts.length === 0) return cwd;
      const prefix = /^[\\/]/.test(cwd) ? "/" : "";
      if (parts.length <= 2) return prefix + parts.join("/");
      return "…/" + parts.slice(-2).join("/");
    }
    case "editor":          return basename(panel.path);
    case "browser":         return panel.url || "Browser";
    case "markdown":        return basename(panel.path);
    case "git-diff":        return basename(panel.path);
    case "git-history":     return "Git History";
    case "git-commit-file": return basename(panel.path);
  }
}

const PANEL_ICONS: Record<Exclude<Panel["kind"], "editor" | "markdown">, IconSvgElement> = {
  terminal: ComputerTerminal01Icon,
  browser: Globe02Icon,
  "git-diff": GitCompareIcon,
  "git-history": GitGraphIcon,
  "git-commit-file": GitCommitIcon,
};

export function panelIcon(panel: Panel, _workspaceId?: string): ReactNode {
  if (panel.kind === "editor" || panel.kind === "markdown") {
    return <img src={fileIconUrl(basename(panel.path))} alt="" className="size-3.5 shrink-0" />;
  }
  return <HugeiconsIcon icon={PANEL_ICONS[panel.kind]} size={13} strokeWidth={2} />;
}
