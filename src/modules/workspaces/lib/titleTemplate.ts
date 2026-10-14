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
// ({?var text}). `raw` is the source slice, re-emitted verbatim when the group names
// something that is not a variable of the scope.
type Node =
  | { kind: "text"; text: string }
  | { kind: "vars"; names: string[]; raw: string }
  | { kind: "cond"; name: string; body: Node[]; raw: string };

const VARS = /^[a-z]+(\s*\|\s*[a-z]+)*$/;
const COND = /^\?([a-z]+)([\s\S]*)$/;

// `{{` and `}}` are literal braces at the top level only: inside a group every brace
// opens or closes, so `{?a {b}}` ends with two closers, not an escape.
function parse(src: string, nested: boolean): Node[] {
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
    if (ch !== "{") {
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
      text += src.slice(i);
      break;
    }
    const raw = src.slice(i, j);
    const inner = raw.slice(1, -1);
    const cond = COND.exec(inner);
    flush();
    if (cond) nodes.push({ kind: "cond", name: cond[1], body: parse(cond[2], true), raw });
    else if (VARS.test(inner)) {
      nodes.push({ kind: "vars", names: inner.split("|").map((n) => n.trim()), raw });
    } else nodes.push({ kind: "text", text: raw });
    i = j - 1;
  }
  flush();
  return nodes;
}

function collect(nodes: Node[], into: Set<string>) {
  for (const n of nodes) {
    if (n.kind === "vars") for (const name of n.names) into.add(name);
    else if (n.kind === "cond") {
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

function render(nodes: Node[], vars: TitleVars): string {
  return nodes
    .map((n) => {
      if (n.kind === "text") return n.text;
      if (n.kind === "vars") {
        if (n.names.some((name) => vars[name as TitleVariable] === undefined)) return n.raw;
        return n.names.map((name) => vars[name as TitleVariable] as string).find(Boolean) ?? "";
      }
      const value = vars[n.name as TitleVariable];
      if (value === undefined) return n.raw;
      return value ? render(n.body, vars) : "";
    })
    .join("");
}

// Returns "" when nothing readable is left so callers fall back to the default title.
export function expandTitle(template: string, vars: TitleVars): string {
  if (!hasTitleVariables(template)) return template;
  return render(parse(template, false), vars).replace(/\s+/g, " ").trim();
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
