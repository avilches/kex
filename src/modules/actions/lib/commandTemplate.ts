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
export function commandProblem(command: string, shell?: CommandShell): string | null {
  if (shell) return command.trim() === "" ? "the command is empty" : quotedProblem(command, shell);
  try {
    return splitArgv(command).length === 0 ? "the command is empty" : null;
  } catch (e) {
    return e instanceof Error ? e.message : UNTERMINATED;
  }
}

// For an app launched without a shell: the command is split first and the variables are
// substituted inside each argument afterwards, so a value with spaces or quotes can
// neither split into several arguments nor add one. A group with spaces in it
// ("{?branch on {branch}}") needs quotes around it to stay one argument. An argument
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

// Where a quoting mistake could turn a value into code: a double quote, a backtick or a
// $( anywhere in the command means some value might end up inside an expansion context.
const EXPANSION_CONTEXT = {
  posix: /["`]|\$\(/,
  powershell: /["`\u201c\u201d\u201e]|\$\(/,
};
// What such a value must not hold. PowerShell does not treat a backslash specially.
const DANGEROUS_VALUE = {
  posix: /[$`"'\\]/,
  powershell: /[$`"'\u2018\u2019\u201a\u201b\u201c\u201d\u201e]/,
};

function quoteFor(command: string, shell: CommandShell): (value: string) => string {
  const guarded = EXPANSION_CONTEXT[shell].test(command);
  const quote =
    shell === "powershell"
      ? (v: string) => `'${v.replace(POWERSHELL_QUOTES, (q) => q + q)}'`
      : (v: string) => quoteShellArg(v, false);
  return (value) => {
    const clean = stripControl(value);
    if (guarded && DANGEROUS_VALUE[shell].test(clean)) {
      throw new Error(
        "a value holds $, a backtick, a backslash or a quote and the command has double quotes, a backtick or $(...), so it cannot be inserted safely",
      );
    }
    return quote(clean);
  };
}

// For a script typed into a terminal: the text is kept exactly as written (line breaks and
// spacing included) and each value is quoted for the shell, so the user writes {cwd}
// bare. A variable inside the user's own quotes, a heredoc or after an escape is refused
// (it would be quoted twice and, in double quotes, a $(...) in the value would run). The
// scan can be fooled, so as a second line of defense, when the command has a double quote,
// a backtick or $( anywhere, a written value holding $, a backtick, a quote or (posix) a
// backslash is refused too instead of guessing; plain values stay allowed. A value
// starting with a dash is still an option to the program: the command itself must put
// `--` before it when needed. Run it only once missingVariables is empty: an empty value
// writes nothing, and the argument it stood for silently disappears.
export function expandCommandShell(command: string, vars: TemplateVars, shell: CommandShell): string {
  const known = (name: string) => typeof vars[name] === "string";
  const problem = quotedProblem(command, shell, known);
  if (problem) throw new Error(problem);
  return renderTemplate(command, vars, quoteFor(command, shell));
}

export function commandVariablesUsed(command: string): Set<string> {
  return titleVariablesUsed(command);
}

// What the command needs and has no value for right now; an Action with any is disabled.
export function missingVariables(command: string, vars: TemplateVars): string[] {
  return missingTemplateVariables(command, vars);
}
