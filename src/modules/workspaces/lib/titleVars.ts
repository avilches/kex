import { pathBasename, pathDirname } from "@/lib/pathUtils";
import type { DirGit } from "./dirGitStore";
import { tabFilePath } from "./tabPath";
import type { TitleDefaults } from "./defaultTitles";
import { expandTitle, type TitleVars } from "./titleTemplate";
import type { Tab, Workspace } from "./types";

// What a title can draw on besides the tab itself. Every field is optional: a caller
// that cannot supply one gets an empty value for its variable, never a crash.
export type TitleSources = {
  runningCommand?: string | null;
  git?: DirGit;
  agent?: string;
  // Title the running program set through OSC 0/2, and the agent's own session title.
  osc?: string;
  session?: string;
  // Default templates in force; the factory ones when absent.
  defaults?: TitleDefaults;
  home?: string | null;
  host?: string;
  // Directory used when the tab has none of its own (a workspace falls back to its root).
  fallbackDir?: string;
};

export function tabDir(tab: Tab): string | undefined {
  if (tab.kind === "terminal") return tab.cwd || undefined;
  if (tab.kind === "git-history") return tab.repoRoot;
  const file = tabFilePath(tab);
  return file ? pathDirname(file) : undefined;
}

function withTilde(path: string, home: string | null | undefined): string {
  if (!home) return path;
  const norm = path.replace(/\\/g, "/");
  const h = home.replace(/\\/g, "/").replace(/\/+$/, "");
  if (norm === h) return "~";
  return norm.startsWith(`${h}/`) ? `~${norm.slice(h.length)}` : path;
}

const base = (p: string | undefined) =>
  p ? pathBasename(p, { tolerateTrailingSlash: true }) : "";

export function tabTitleVars(tab: Tab | null, src: TitleSources = {}): TitleVars {
  const dir = (tab && tabDir(tab)) || src.fallbackDir;
  const file = tab ? tabFilePath(tab) : null;
  return {
    cwd: dir ? withTilde(dir, src.home) : "",
    dir: base(dir),
    branch: src.git?.branch ?? "",
    repo: base(src.git?.repoRoot),
    cmd: (src.runningCommand ?? "").trim().replace(/\s+/g, " "),
    file: file ? base(file) : "",
    agent: src.agent ?? "",
    host: src.host ?? "",
    osc: (src.osc ?? "").trim(),
    session: (src.session ?? "").trim(),
    url: tab?.kind === "browser" ? tab.url : "",
  };
}

// "" when the tab has no title of its own or its template expands to nothing.
export function expandTabTitle(tab: Tab, src: TitleSources = {}): string {
  return tab.title ? expandTitle(tab.title, tabTitleVars(tab, src)) : "";
}

// A workspace has no location of its own: the focused tab supplies it, and the workspace
// root stands in while that tab is a browser or there is none.
export function workspaceTitleVars(
  ws: Pick<Workspace, "cwd" | "workspaceRoot">,
  focused: Tab | null,
  focusedTitle: string,
  src: TitleSources = {},
): TitleVars {
  const fallbackDir = ws.cwd || ws.workspaceRoot || undefined;
  return { ...tabTitleVars(focused, { ...src, fallbackDir }), tab: focusedTitle };
}

export function workspaceDir(
  ws: Pick<Workspace, "cwd" | "workspaceRoot">,
  focused: Tab | null,
): string | undefined {
  return (focused && tabDir(focused)) || ws.cwd || ws.workspaceRoot || undefined;
}

export function expandWorkspaceTitle(
  ws: Pick<Workspace, "title" | "cwd" | "workspaceRoot">,
  focused: Tab | null,
  focusedTitle: string,
  src: TitleSources = {},
): string {
  return expandTitle(ws.title, workspaceTitleVars(ws, focused, focusedTitle, src));
}
