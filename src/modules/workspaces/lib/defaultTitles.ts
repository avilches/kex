import type { Tab } from "./types";

export type TitleDefaultKind =
  | "terminal"
  | "agent"
  | "file"
  | "browser"
  | "gitHistory"
  | "workspace";

export type TitleDefaults = Record<TitleDefaultKind, string>;

// Reproduces what Kex showed before the defaults became configurable.
export const FACTORY_TITLE_DEFAULTS: TitleDefaults = {
  terminal: "{cmd|osc|cwd}",
  agent: "{osc|session|{agent}{?dir · {dir}}}",
  file: "{file}",
  browser: "{url}",
  gitHistory: "Git History",
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
    default:
      return "file";
  }
}
