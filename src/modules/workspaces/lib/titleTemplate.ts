export const TITLE_VARIABLES = [
  "cwd",
  "dir",
  "branch",
  "repo",
  "cmd",
  "file",
  "agent",
  "host",
  "osc",
  "session",
  "url",
  "tab",
] as const;

export type TitleVariable = (typeof TITLE_VARIABLES)[number];

// A key that is present (even as "") is a known variable of that scope; a missing key
// stays literal in the output, so `{tab}` in a tab title is visibly not a variable there.
export type TitleVars = Partial<Record<TitleVariable, string>>;

// A template is parsed into text, variable groups ({a|b|c}) and conditionals
// ({?var text}). An alternative of a group is a bare variable name or, when it has
// anything else in it, a template of its own ({osc|{agent} - {dir}}). `raw` is the
// source slice, re-emitted verbatim when the group names something that is not a
// variable of the scope.
type Alt = { name: string } | { nodes: Node[] };
type Node =
  | { kind: "text"; text: string }
  | { kind: "vars"; v: Alt[]; raw: string }
  | { kind: "cond"; name: string; body: Node[]; raw: string };

const BARE = /^[a-z]+$/;
const COND = /^\?([a-z]+)([\s\S]*)$/;

// `{{` and `}}` are literal braces at the top level only: inside a group every brace
// opens or closes, so `{?a {b}}` ends with two closers, not an escape.
const MAX_DEPTH = 16;

// A brace that does not open a readable group stays text and scanning resumes right after
// it, so what follows still expands. Groups nested deeper than MAX_DEPTH are plain text.
function parse(src: string, nested: boolean, level = 0): Node[] {
  const nodes: Node[] = [];
  let text = "";
  const flush = () => {
    if (text) nodes.push({ kind: "text", text });
    text = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!nested && (ch === "{" || ch === "}") && src[i + 1] === ch) {
      text += ch;
      i++;
      continue;
    }
    if (ch !== "{" || level >= MAX_DEPTH) {
      text += ch;
      continue;
    }
    let depth = 1;
    let j = i + 1;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
    }
    if (depth > 0) {
      text += ch;
      continue;
    }
    const raw = src.slice(i, j);
    const inner = raw.slice(1, -1);
    const cond = COND.exec(inner);
    const parts = cond ? [] : splitAlternatives(inner);
    if (!cond && parts.length === 1 && !BARE.test(inner)) {
      text += ch;
      continue;
    }
    flush();
    if (cond) {
      nodes.push({ kind: "cond", name: cond[1], body: parse(cond[2], true, level + 1), raw });
    } else {
      const v = parts.map(
        (a): Alt => (BARE.test(a.trim()) ? { name: a.trim() } : { nodes: parse(a, true, level + 1) }),
      );
      nodes.push({ kind: "vars", v, raw });
    }
    i = j - 1;
  }
  flush();
  return nodes;
}

function splitAlternatives(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "{") depth++;
    else if (inner[i] === "}") depth--;
    else if (inner[i] === "|" && depth === 0) {
      parts.push(inner.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(inner.slice(from));
  return parts;
}

function collect(nodes: Node[], into: Set<string>) {
  for (const n of nodes) {
    if (n.kind === "vars") {
      for (const a of n.v) {
        if ("name" in a) into.add(a.name);
        else collect(a.nodes, into);
      }
    } else if (n.kind === "cond") {
      into.add(n.name);
      collect(n.body, into);
    }
  }
}

export function titleVariablesUsed(template: string): Set<string> {
  const used = new Set<string>();
  collect(parse(template, false), used);
  return used;
}

export function hasTitleVariables(template: string): boolean {
  return /[{}]/.test(template);
}

// Own properties only: `constructor` and the like must not resolve to Object.prototype.
function lookup(vars: TitleVars, name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name as TitleVariable] : undefined;
}

function render(nodes: Node[], vars: TitleVars): string {
  return nodes
    .map((n) => {
      if (n.kind === "text") return n.text;
      if (n.kind === "vars") {
        if (n.v.some((a) => "name" in a && lookup(vars, a.name) === undefined)) return n.raw;
        for (const a of n.v) {
          const value = "name" in a ? (lookup(vars, a.name) as string) : render(a.nodes, vars);
          if (value.trim()) return value;
        }
        return "";
      }
      const value = lookup(vars, n.name);
      if (value === undefined) return n.raw;
      return value.trim() ? render(n.body, vars) : "";
    })
    .join("");
}

// Returns "" when nothing readable is left so callers fall back to the default title.
export function expandTitle(template: string, vars: TitleVars): string {
  if (!hasTitleVariables(template)) return template;
  return render(parse(template, false), vars).replace(/\s+/g, " ").trim();
}

export type TitleScope = "tab" | "workspace";

// Where a variable has a value: every tab, or only one kind. A workspace takes the values
// of its focused tab, so the same groups apply to it.
export type TitleVariableGroup = "common" | "terminal" | "file" | "browser" | "workspace";

export const TITLE_GROUP_LABELS: Record<TitleVariableGroup, string> = {
  common: "Any tab or workspace",
  terminal: "Terminals",
  file: "Editors and diffs",
  browser: "Browsers",
  workspace: "Workspaces only",
};

export const TITLE_VARIABLE_DOCS: ReadonlyArray<{
  name: TitleVariable;
  description: string;
  example: string;
  group: TitleVariableGroup;
  scope: TitleScope | "both";
}> = [
  {
    name: "cwd",
    description: "Full path of the folder the tab is in (for a file, the folder that holds it)",
    example: "~/code/kex/src",
    group: "common",
    scope: "both",
  },
  { name: "dir", description: "Only the name of that folder", example: "src", group: "common", scope: "both" },
  { name: "branch", description: "Git branch of that folder, empty outside a repository", example: "main", group: "common", scope: "both" },
  { name: "repo", description: "Name of the git repository", example: "kex", group: "common", scope: "both" },
  { name: "host", description: "Name of this computer", example: "MacBook", group: "common", scope: "both" },
  { name: "cmd", description: "Command running right now", example: "npm run dev", group: "terminal", scope: "both" },
  { name: "osc", description: "Title the program in the terminal sets for itself", example: "vim notes.md", group: "terminal", scope: "both" },
  { name: "agent", description: "Coding agent running in the terminal", example: "claude", group: "terminal", scope: "both" },
  { name: "session", description: "Title of that agent's session", example: "Fix login bug", group: "terminal", scope: "both" },
  { name: "file", description: "Name of the file", example: "index.ts", group: "file", scope: "both" },
  { name: "url", description: "Address of the page", example: "https://example.com/docs", group: "browser", scope: "both" },
  { name: "tab", description: "Title of the focused tab", example: "npm run dev", group: "workspace", scope: "workspace" },
];

export function titleVariableDocs(scope: TitleScope) {
  return TITLE_VARIABLE_DOCS.filter((v) => v.scope === "both" || v.scope === scope);
}

const TITLE_SYNTAX_HINT =
  "{a|b} uses the first value that is not empty. {?var text} shows the text only when var has a value. Use {{ and }} for literal braces.";

export const TITLE_VARIABLES_HINT = `${TITLE_VARIABLE_DOCS.map((v) => `{${v.name}}`).join(" ")}. ${TITLE_SYNTAX_HINT}`;
