import type { Tab } from "./types";

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

// Only strings count, so `constructor` and the like never resolve through Object.prototype.
function lookup(vars: TitleVars, name: string): string | undefined {
  const value: unknown = (vars as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
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

// What is being titled; decides which variables are worth offering.
export type TitleSubject = Tab["kind"] | "workspace";

// Where a variable has a value: every tab, or only one kind. A workspace takes the values
// of its focused tab, so it can use all of them.
export type TitleVariableGroup = "common" | "place" | "terminal" | "file" | "browser" | "workspace";

export const TITLE_GROUP_LABELS: Record<TitleVariableGroup, string> = {
  common: "Any tab or workspace",
  place: "Tabs that live in a folder (not browsers)",
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
}> = [
  {
    name: "cwd",
    description: "Full path of the folder the tab is in (for a file, the folder that holds it)",
    example: "~/code/kex/src",
    group: "place",
  },
  { name: "dir", description: "Only the name of that folder", example: "src", group: "place" },
  { name: "branch", description: "Git branch of that folder, empty outside a repository", example: "main", group: "place" },
  { name: "repo", description: "Name of the git repository", example: "kex", group: "place" },
  { name: "host", description: "Name of this computer", example: "MacBook", group: "common" },
  { name: "cmd", description: "Command running right now", example: "npm run dev", group: "terminal" },
  { name: "osc", description: "Title the program in the terminal sets for itself", example: "vim notes.md", group: "terminal" },
  { name: "agent", description: "Coding agent running in the terminal", example: "claude", group: "terminal" },
  { name: "session", description: "Title of that agent's session", example: "Fix login bug", group: "terminal" },
  { name: "file", description: "Name of the file", example: "index.ts", group: "file" },
  { name: "url", description: "Address of the page", example: "https://example.com/docs", group: "browser" },
  { name: "tab", description: "Title of the focused tab", example: "npm run dev", group: "workspace" },
];

const GROUPS_FOR: Record<TitleSubject, TitleVariableGroup[]> = {
  terminal: ["common", "place", "terminal"],
  editor: ["common", "place", "file"],
  markdown: ["common", "place", "file"],
  "git-diff": ["common", "place", "file"],
  "git-commit-file": ["common", "place", "file"],
  browser: ["common", "browser"],
  "git-history": ["common", "place"],
  workspace: ["common", "place", "terminal", "file", "browser", "workspace"],
};

// Only the variables the subject can have a value for.
export function titleVariableDocs(subject: TitleSubject) {
  const groups = GROUPS_FOR[subject];
  return TITLE_VARIABLE_DOCS.filter((v) => groups.includes(v.group));
}

const TITLE_SYNTAX_HINT =
  "{a|b} uses the first value that is not empty. {?var text} shows the text only when var has a value. Use {{ and }} for literal braces.";

export function titleVariablesHint(subject: TitleSubject): string {
  return `${titleVariableDocs(subject).map((v) => `{${v.name}}`).join(" ")}. ${TITLE_SYNTAX_HINT}`;
}
