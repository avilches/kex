import { quoteShellArg } from "@/lib/shellQuote";
import { quotedVariables } from "@/modules/actions/lib/quotedVariables";
import {
  missingTemplateVariables,
  renderTemplate,
  TITLE_VARIABLES,
  titleVariablesUsed,
  type TemplateVars,
} from "@/modules/workspaces/lib/titleTemplate";

// Command templates ("pycharm {cwd}") share the grammar and the variables of title
// templates, but a command is run, not shown: whitespace is kept, values are raw (home is
// never turned into ~) and every value is quoted for how the command will be run.

export type CommandShell = "posix" | "powershell";

const UNTERMINATED = "unterminated quote";

const isSpace = (ch: string) => /\s/.test(ch);

// Splits like a POSIX shell would, with none of its expansions, except that a backslash is
// always literal. Commands hold Windows paths (C:\tools\x.exe, \\server\share, "C:\dir\")
// as often as POSIX ones, and no escape rule keeps both intact. The price is that a quote
// cannot be escaped: to put a " in an argument wrap it in '...' and the other way round,
// and a space in a path needs quotes, never a backslash.
export function splitArgv(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inToken = false;
  let quote: '"' | "'" | null = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (isSpace(ch)) {
      if (inToken) args.push(current);
      current = "";
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (quote) throw new Error(UNTERMINATED);
  if (inToken) args.push(current);
  return args;
}

const knownTitleVariable = (name: string) => (TITLE_VARIABLES as readonly string[]).includes(name);

function quotedProblem(command: string, shell: CommandShell, isKnown = knownTitleVariable): string | null {
  const quoted = quotedVariables(command, shell, isKnown);
  if (quoted.length === 0) return null;
  const names = quoted.map((n) => `{${n}}`).join(", ");
  return `${names} sits inside quotes, a heredoc or after an escape: write it bare, Kex quotes the value itself`;
}

// Why a command cannot be launched as it is typed, or null when it can. Without a shell
// the command is an app's (split into arguments); with one it is a script, whose own
// quotes are the shell's business except around a variable.
// With the current values of a script, a value that is unsafe to write is reported too.
export function commandProblem(command: string, shell?: CommandShell, vars?: TemplateVars): string | null {
  if (shell) {
    if (command.trim() === "") return "the command is empty";
    const quoted = quotedProblem(command, shell, vars ? (n) => typeof vars[n] === "string" : undefined);
    if (quoted || !vars) return quoted;
    const unsafe = unsafeVariables(command, vars, shell);
    return unsafe.length > 0 ? unsafeMessage(unsafe) : null;
  }
  try {
    return splitArgv(command).length === 0 ? "the command is empty" : null;
  } catch (e) {
    return e instanceof Error ? e.message : UNTERMINATED;
  }
}

// For an app launched without a shell: the command is split first and the variables are
// substituted inside each argument afterwards, so a value with spaces or quotes can
// neither split into several arguments nor add one. A group with spaces in it
// ("{branch? on {branch}}") needs quotes around it to stay one argument. An argument
// whose variable is empty stays as an empty argument; the caller decides beforehand,
// with missingVariables, whether the command is available at all.
export function expandCommandArgv(command: string, vars: TemplateVars): string[] {
  return splitArgv(command).map((arg) => renderTemplate(arg, vars));
}

// PowerShell reads U+2018, U+2019, U+201A and U+201B as a single quote too.
const POWERSHELL_QUOTES = /['‘’‚‛]/g;

// The line is typed into a terminal, where a control character (a newline would end the
// command, ESC or ^C act on the terminal) is never part of a name worth keeping. C0, DEL, C1
// (some terminals read them as escape sequences) and the Unicode line and paragraph
// separators (which PowerShell reads as line breaks) go.
function stripControl(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const control = code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
    if (!control) out += ch;
  }
  return out;
}

// What a value written into a script must not hold, whatever the command looks like.
// Quoting protects an argument, but arithmetic and subscript contexts re-evaluate the
// expanded text (`(( {cwd} ))`, `a[{cwd}]=1`, `${x:0:{cwd}}`), where a `$(...)` in a
// single-quoted value still runs. A path with these characters is rare and refusing it is
// safer than guessing which contexts the command has. PowerShell treats a backslash as an
// ordinary character; it was not available to test, so the rest is as strict as posix.
const UNSAFE_VALUE = {
  posix: /[$`"'\\]/,
  powershell: /[$`"'\u2018\u2019\u201a\u201b\u201c\u201d\u201e]/,
};

const unsafeMessage = (names: string[]) =>
  `${names.map((n) => `{${n}}`).join(", ")} cannot be used in a script right now: its value contains $, a backtick, a quote or a backslash`;

// The variables the command would write whose current value is unsafe for a script. Lets
// the UI say why an Action cannot run in this context (the value, not the command, is the
// problem), next to missingVariables.
export function unsafeVariables(command: string, vars: TemplateVars, shell: CommandShell): string[] {
  const bad = new Set<string>();
  renderTemplate(command, vars, (v) => {
    if (UNSAFE_VALUE[shell].test(stripControl(v))) bad.add(v);
    return "";
  });
  if (bad.size === 0) return [];
  return [...titleVariablesUsed(command)].filter((n) => typeof vars[n] === "string" && bad.has(vars[n] as string));
}

function quoteFor(shell: CommandShell): (value: string) => string {
  return shell === "powershell"
    ? (v) => `'${stripControl(v).replace(POWERSHELL_QUOTES, (q) => q + q)}'`
    : (v) => quoteShellArg(stripControl(v), false);
}

// For a script typed into a terminal: the text is kept exactly as written (line breaks and
// spacing included) and each value is quoted for the shell, so the user writes {cwd}
// bare. Two layers keep a value from becoming code. A variable inside the user's own
// quotes, a heredoc or after an escape is refused (it would be quoted twice and, in
// double quotes, a $(...) in the value would run); the scan can be fooled, and quoting
// does not help in arithmetic or subscripts, so every written value holding $, a
// backtick, a quote or (posix) a backslash is refused too, unconditionally (see
// unsafeVariables). A value starting with a dash is still an option to the program: the
// command itself must put `--` before it when needed. Run it only once missingVariables
// is empty: an empty value writes nothing, and the argument it stood for silently
// disappears.
export function expandCommandShell(command: string, vars: TemplateVars, shell: CommandShell): string {
  const known = (name: string) => typeof vars[name] === "string";
  const problem = quotedProblem(command, shell, known);
  if (problem) throw new Error(problem);
  const unsafe = unsafeVariables(command, vars, shell);
  if (unsafe.length > 0) throw new Error(unsafeMessage(unsafe));
  return renderTemplate(command, vars, quoteFor(shell));
}

export function commandVariablesUsed(command: string): Set<string> {
  return titleVariablesUsed(command);
}

// What the command needs and has no value for right now; an Action with any is disabled.
export function missingVariables(command: string, vars: TemplateVars): string[] {
  return missingTemplateVariables(command, vars);
}
