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

export const TITLE_VARIABLES_HINT =
  "Variables: {cwd} {dir} {branch} {repo} {cmd} {file} {agent} {host}; workspaces also {tab}. Use {{ and }} for literal braces.";
