/** How each known agent is told to run without permission prompts: a switch after the binary, or
 * an environment assignment before it. Agents absent here have no such switch. */
type Bypass = { flag?: string; env?: string };

const BYPASS: Readonly<Record<string, Bypass>> = {
  claude: { flag: "--dangerously-skip-permissions" },
  codex: { flag: "--dangerously-bypass-approvals-and-sandbox" },
  agy: { flag: "--dangerously-skip-permissions" },
  openclaude: { flag: "--dangerously-skip-permissions" },
  grok: { flag: "--permission-mode bypassPermissions" },
  aider: { flag: "--yes-always" },
  "cursor-agent": { flag: "--yolo" },
  goose: { env: "GOOSE_MODE=auto" },
};

const ASSIGNMENT = /^\s*(?:[A-Za-z_]\w*=\S*\s+)*/;

type Tok = { text: string; start: number; end: number; op: boolean; quoted: boolean };

// Splits a command line the way a shell would see its words, keeping where each one sits so an edit
// can touch only that span: a quoted word is marked, never read as a flag, and `&&`, `||`, `;`, `|`
// and `&` outside quotes are tokens of their own that end the command of the agent.
function tokenize(command: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < command.length) {
    const c = command[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "&" || c === "|" || c === ";") {
      const two = (c === "&" || c === "|") && command[i + 1] === c;
      out.push({ text: command.slice(i, i + (two ? 2 : 1)), start: i, end: i + (two ? 2 : 1), op: true, quoted: false });
      i += two ? 2 : 1;
      continue;
    }
    const start = i;
    let quoted = false;
    while (i < command.length) {
      const d = command[i] as string;
      if (/\s/.test(d) || d === "&" || d === "|" || d === ";") break;
      if (d === "\\") {
        i += 2;
        continue;
      }
      if (d === '"' || d === "'") {
        quoted = true;
        i++;
        while (i < command.length && command[i] !== d) i += command[i] === "\\" && d === '"' ? 2 : 1;
        i++;
        continue;
      }
      i++;
    }
    i = Math.min(i, command.length);
    out.push({ text: command.slice(start, i), start, end: i, op: false, quoted });
  }
  return out;
}

const isAssignment = (t: Tok): boolean => !t.op && !t.quoted && /^[A-Za-z_]\w*=/.test(t.text);

/** The words of the agent's own command: its leading assignments, the binary and what follows up to
 * the first operator. */
function agentWords(command: string): { assignments: Tok[]; binary: Tok; args: Tok[] } | null {
  const toks = tokenize(command);
  let n = 0;
  while (toks[n] && isAssignment(toks[n] as Tok)) n++;
  const binary = toks[n];
  if (!binary || binary.op) return null;
  const args: Tok[] = [];
  for (let k = n + 1; k < toks.length && !(toks[k] as Tok).op; k++) args.push(toks[k] as Tok);
  return { assignments: toks.slice(0, n), binary, args };
}

/** Where the switch's words sit among the plain (unquoted) arguments, or null. */
function findFlag(args: readonly Tok[], flag: string): { from: Tok; to: Tok } | null {
  const parts = flag.split(/\s+/);
  for (let k = 0; k + parts.length <= args.length; k++) {
    const run = args.slice(k, k + parts.length);
    if (run.every((t, m) => !t.quoted && t.text === parts[m])) return { from: run[0] as Tok, to: run[run.length - 1] as Tok };
  }
  return null;
}

// A value the agent already got for the same option as the switch (`--permission-mode plan`).
function findOption(args: readonly Tok[], option: string): { from: Tok; to: Tok } | null {
  for (let k = 0; k < args.length; k++) {
    const t = args[k] as Tok;
    if (t.quoted) continue;
    if (t.text.startsWith(`${option}=`)) return { from: t, to: t };
    if (t.text === option) return { from: t, to: (args[k + 1] && !(args[k + 1] as Tok).quoted ? args[k + 1] : t) as Tok };
  }
  return null;
}

const cut = (command: string, from: number, to: number): string =>
  `${command.slice(0, from).trimEnd()}${command.slice(to).length && !/^\s/.test(command.slice(to)) ? " " : ""}${command.slice(to)}`.replace(/\s+$/, "");

/** The agent a command starts: its binary name, past any leading `VAR=value`, without directory
 * or Windows extension. Null when the command has no binary yet. */
export function agentBinary(command: string): string | null {
  const rest = command.replace(ASSIGNMENT, "");
  const first = rest.match(/^\S+/)?.[0];
  if (!first) return null;
  return (first.split(/[\\/]/).pop() ?? "").replace(/\.(exe|cmd|bat)$/i, "") || null;
}

function bypassOf(command: string): Bypass | null {
  const binary = agentBinary(command);
  return binary ? (BYPASS[binary] ?? null) : null;
}

/** The text the checkbox stands for, or null when the command is not a known agent. */
export function yoloSwitch(command: string): string | null {
  const bypass = bypassOf(command);
  return bypass ? (bypass.env ?? bypass.flag ?? null) : null;
}

export function isYolo(command: string): boolean {
  const bypass = bypassOf(command);
  const words = agentWords(command);
  if (!bypass || !words) return false;
  if (bypass.env) return words.assignments.some((t) => t.text === bypass.env);
  return !!bypass.flag && findFlag(words.args, bypass.flag) !== null;
}

/** Adds the switch at the end of the agent's own command (the assignment before the binary), or
 * removes it from there; text in quotes and whatever follows `&&`, `;` or `|` is never touched. */
export function setYolo(command: string, on: boolean): string {
  const bypass = bypassOf(command);
  const words = agentWords(command);
  const token = bypass ? (bypass.env ?? bypass.flag) : null;
  if (!bypass || !words || !token) return command;
  if (bypass.env) {
    const at = words.assignments.find((t) => t.text === bypass.env);
    if (!on) return at ? cut(command, at.start, at.end).trim() : command;
    if (at) return command;
    const first = words.binary;
    return `${command.slice(0, first.start)}${token} ${command.slice(first.start)}`.trim();
  }
  const flag = bypass.flag as string;
  const found = findFlag(words.args, flag);
  if (!on) return found ? cut(command, found.from.start, found.to.end) : command;
  if (found) return command;
  // An option with another value (`--permission-mode plan`) is replaced, or the agent would get it twice.
  const option = flag.includes(" ") ? findOption(words.args, flag.split(/\s+/)[0] as string) : null;
  if (option) return `${command.slice(0, option.from.start)}${flag}${command.slice(option.to.end)}`;
  const last = words.args[words.args.length - 1] ?? words.binary;
  return `${command.slice(0, last.end)} ${flag}${command.slice(last.end)}`;
}

/** A known agent's id with its bypass switch applied, or the bare id. */
export function yoloCommand(id: string): string {
  return setYolo(id, true);
}
