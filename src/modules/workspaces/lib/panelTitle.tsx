import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { Panel } from "./types";

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function panelTitle(panel: Panel): string {
  if (panel.kind !== "terminal" && panel.title) return panel.title;
  switch (panel.kind) {
    case "terminal": {
      if (panel.runningCommand) return basename(panel.runningCommand.trim().split(/\s+/)[0] ?? "");
      if (panel.title) return panel.title;
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
    case "preview":         return panel.url || "Preview";
    case "markdown":        return basename(panel.path);
    case "git-diff":        return basename(panel.path);
    case "git-history":     return "Git History";
    case "git-commit-file": return basename(panel.path);
  }
}

export function panelIcon(panel: Panel, _workspaceId?: string): ReactNode {
  switch (panel.kind) {
    case "terminal":
      return <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={1.5} />;
    case "editor":          return "📄";
    case "preview":         return "🌐";
    case "markdown":        return "📝";
    case "git-diff":        return "±";
    case "git-history":     return "⏱";
    case "git-commit-file": return "±";
  }
}
