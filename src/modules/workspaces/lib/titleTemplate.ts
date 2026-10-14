export const TITLE_VARIABLES = [
  "cwd",
  "dir",
  "branch",
  "repo",
  "cmd",
  "file",
  "agent",
  "host",
  "tab",
] as const;

export type TitleVariable = (typeof TITLE_VARIABLES)[number];

// A key that is present (even as "") is a known variable of that scope; a missing key
// stays literal in the output, so `{tab}` in a tab title is visibly not a variable there.
export type TitleVars = Partial<Record<TitleVariable, string>>;

const TOKEN = /\{\{|\}\}|\{([a-z]+)\}/g;

export function titleVariablesUsed(template: string): Set<string> {
  const used = new Set<string>();
  for (const m of template.matchAll(TOKEN)) if (m[1]) used.add(m[1]);
  return used;
}

export function hasTitleVariables(template: string): boolean {
  return /[{}]/.test(template);
}

// Returns "" when nothing readable is left so callers fall back to the default title.
export function expandTitle(template: string, vars: TitleVars): string {
  if (!hasTitleVariables(template)) return template;
  const out = template.replace(TOKEN, (match, name: string | undefined) => {
    if (match === "{{") return "{";
    if (match === "}}") return "}";
    const value = name ? vars[name as TitleVariable] : undefined;
    return value === undefined ? match : value;
  });
  return out.replace(/\s+/g, " ").trim();
}

export type TitleScope = "tab" | "workspace";

export const TITLE_VARIABLE_DOCS: ReadonlyArray<{
  name: TitleVariable;
  description: string;
  scope: TitleScope | "both";
}> = [
  { name: "cwd", description: "Full working directory, home shown as ~", scope: "both" },
  { name: "dir", description: "Name of the working directory", scope: "both" },
  { name: "branch", description: "Git branch (empty outside a repo)", scope: "both" },
  { name: "repo", description: "Name of the git repository folder", scope: "both" },
  { name: "cmd", description: "Command running in the terminal", scope: "both" },
  { name: "file", description: "File name of an editor tab", scope: "both" },
  { name: "agent", description: "Coding agent running in the terminal", scope: "both" },
  { name: "host", description: "This machine's name", scope: "both" },
  { name: "tab", description: "Title of the focused tab", scope: "workspace" },
];

export function titleVariableDocs(scope: TitleScope) {
  return TITLE_VARIABLE_DOCS.filter((v) => v.scope === "both" || v.scope === scope);
}

export const TITLE_VARIABLES_HINT = `${TITLE_VARIABLE_DOCS.map((v) => `{${v.name}}`).join(" ")}. Use {{ and }} for literal braces.`;
