import type { Tab } from "./types";

export type TitleDefaultKind =
  | "terminal"
  | "agent"
  | "editor"
  | "diff"
  | "browser"
  | "gitHistory"
  | "workspace";

export type TitleDefaults = Record<TitleDefaultKind, string>;

// What a tab or workspace shows until the user renames it. An idle terminal says where it is:
// the folder and, inside a repository, its branch. Once something runs (a command or an OSC
// title) it says what plus the folder only, since the title is already long. An agent shows its
// title and the branch. A terminal tab always has its folder (it is set when the tab is
// created, OSC 7 only follows later `cd`s), so the folder is never empty.
export const FACTORY_TITLE_DEFAULTS: TitleDefaults = {
  terminal: "{cmd|osc?{cmd|osc} · {dir}{:}{dir}{branch? · {branch}}}",
  agent: "{osc|session|{agent}}{branch? · {branch}}",
  editor: "{file}",
  diff: "{file}",
  browser: "{url}",
  gitHistory: "Git History{dir? · {dir}}",
  workspace: "{dir}",
};

// Shown when a template expands to nothing; a template cannot make a title disappear.
export const FALLBACK_TITLES = {
  terminal: "shell",
  browser: "Browser",
  gitHistory: "Git History",
  workspace: "shell",
} as const;

// A pref left empty means "use the factory default".
export function resolveTitleDefaults(
  prefs: Partial<Record<TitleDefaultKind, string>>,
): TitleDefaults {
  const out = { ...FACTORY_TITLE_DEFAULTS };
  for (const kind of Object.keys(out) as TitleDefaultKind[]) {
    const v = prefs[kind]?.trim();
    if (v) out[kind] = v;
  }
  return out;
}

export function defaultKindFor(tab: Tab, hasAgent: boolean): TitleDefaultKind {
  switch (tab.kind) {
    case "terminal":
      return hasAgent ? "agent" : "terminal";
    case "browser":
      return "browser";
    case "git-history":
      return "gitHistory";
    case "git-diff":
    case "git-commit-file":
      return "diff";
    default:
      return "editor";
  }
}
