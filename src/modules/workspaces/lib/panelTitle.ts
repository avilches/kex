import type { Panel } from "./types";

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function panelTitle(panel: Panel): string {
  if (panel.title) return panel.title;
  switch (panel.kind) {
    case "terminal":        return panel.cwd ? basename(panel.cwd) : "shell";
    case "editor":          return basename(panel.path);
    case "preview":         return panel.url || "Preview";
    case "markdown":        return basename(panel.path);
    case "git-diff":        return basename(panel.path);
    case "git-history":     return "Git History";
    case "git-commit-file": return basename(panel.path);
  }
}

export function panelIcon(panel: Panel): string {
  switch (panel.kind) {
    case "terminal":        return "▶";
    case "editor":          return "📄";
    case "preview":         return "🌐";
    case "markdown":        return "📝";
    case "git-diff":        return "±";
    case "git-history":     return "⏱";
    case "git-commit-file": return "±";
  }
}
