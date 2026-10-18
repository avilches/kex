import { quoteShellArg } from "@/lib/shellQuote";
import {
  missingTemplateVariables,
  renderTemplate,
  titleVariablesUsed,
  type TemplateVars,
} from "@/modules/workspaces/lib/titleTemplate";

// Command templates ("pycharm {cwd}") share the grammar and the variables of title
// templates, but a command is run, not shown: whitespace is kept, values are raw (home is
// never turned into ~) and every value is quoted for how the command will be run.

export type CommandShell = "posix" | "powershell";

const UNTERMINATED = "unterminated quote";

const isSpace = (ch: string) => /\s/.test(ch);

// Splits like a POSIX shell would, with none of its expansions. Unquoted, a backslash
// escapes whitespace, a quote or another backslash and is otherwise literal, so a Windows
// path such as C:\tools\x.exe survives; inside double quotes it escapes only " \ $ and `.
export function splitArgv(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inToken = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command.charAt(i);
    const next = command.charAt(i + 1);
    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && next !== "" && '"\\$`'.includes(next)) {
        current += next;
        i++;
      } else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (ch === "\\" && next !== "" && (isSpace(next) || "\"'\\".includes(next))) {
      current += next;
      inToken = true;
      i++;
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

// Why a command cannot be launched as it is typed, or null when it can.
export function commandProblem(command: string): string | null {
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

function quoteFor(shell: CommandShell): (value: string) => string {
  return shell === "powershell"
    ? (value) => `'${value.replace(POWERSHELL_QUOTES, (q) => q + q)}'`
    : (value) => quoteShellArg(value, false);
}

// For a script typed into a terminal: the text is kept exactly as written (line breaks and
// spacing included) and each value is quoted for the shell, so the user writes {cwd}
// bare, never inside quotes of their own, which would be quoted a second time.
export function expandCommandShell(command: string, vars: TemplateVars, shell: CommandShell): string {
  return renderTemplate(command, vars, quoteFor(shell));
}

export function commandVariablesUsed(command: string): Set<string> {
  return titleVariablesUsed(command);
}

// What the command needs and has no value for right now; an Action with any is disabled.
export function missingVariables(command: string, vars: TemplateVars): string[] {
  return missingTemplateVariables(command, vars);
}
