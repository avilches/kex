import { quoteShellArg } from "@/lib/shellQuote";
import type { ScriptCwdMode } from "./types";

export type ScriptShell = "posix" | "powershell";

export type ScriptCwdInput = {
  mode: ScriptCwdMode | undefined;
  fixedFolder?: string;
  /** Folder of the focused tab, with the agent worktree already applied. */
  focusFolder?: string | null;
  workspaceRoot?: string | null;
  workspaceCwd?: string | null;
};

function present(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function resolveScriptCwd(input: ScriptCwdInput): string | undefined {
  const workspaceFolder =
    present(input.workspaceRoot) ?? present(input.workspaceCwd);
  switch (input.mode) {
    case "context":
      return present(input.focusFolder) ?? workspaceFolder;
    case "fixed":
      return present(input.fixedFolder) ?? workspaceFolder;
    default:
      return workspaceFolder;
  }
}

/** PowerShell reads U+2018, U+2019, U+201A and U+201B as a single quote too. */
const POWERSHELL_QUOTES = /['‘’‚‛]/g;

export function isSafeScriptCwd(cwd: string): boolean {
  return !/[\x00-\x1f\x7f]/.test(cwd);
}

/** `~`, `-x` and `.` are not resolved by the typed `cd`, so only absolute paths are accepted. */
export function isAbsoluteScriptCwd(cwd: string): boolean {
  return /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(cwd);
}

/** Why a folder cannot be used as the script folder, or null when it can. */
export function scriptCwdProblem(cwd: string): string | null {
  if (!isSafeScriptCwd(cwd)) return "the folder name has control characters";
  if (!isAbsoluteScriptCwd(cwd)) {
    return "the folder must be an absolute path (no ~ or relative folders)";
  }
  return null;
}

/** Message for a stat-ed script folder (stat is null when it does not exist). */
export function scriptFolderMissingMessage(
  cwd: string,
  stat: { kind: string } | null,
): string | null {
  if (stat?.kind === "dir") return null;
  return stat
    ? `Script not run: ${cwd} is not a folder`
    : `Script not run: the folder ${cwd} does not exist`;
}

export function scriptShellFor(
  isWindows: boolean,
  envKind: string,
): ScriptShell {
  return isWindows && envKind !== "wsl" ? "powershell" : "posix";
}

// `cd --` keeps a folder starting with a dash from being read as an option.
// The blank line before "}" keeps a command ending in "\" (or a PowerShell
// backtick) from joining its line break with the closing brace.
// Limitations: cmd.exe is not told apart from PowerShell (a Windows workspace
// is assumed to run PowerShell), and fish before 4.1 has no `{ }` group, so
// there the typed line is a syntax error and nothing runs.
export function buildScriptInput(
  command: string,
  cwd: string | undefined,
  shell: ScriptShell,
): string {
  if (!cwd) return command + "\r";
  const problem = scriptCwdProblem(cwd);
  if (problem) throw new Error(`script folder rejected: ${problem}`);
  if (shell === "powershell") {
    const literal = `'${cwd.replace(POWERSHELL_QUOTES, (q) => q + q)}'`;
    return `Set-Location -LiteralPath ${literal}; if ($?) { ${command}\n\n}\r`;
  }
  return `cd -- ${quoteShellArg(cwd, false)} && { ${command}\n\n}\r`;
}

/** What to type into an existing script tab, or null if it is still busy. */
export function planReusedTabInput(
  running: boolean,
  command: string,
  cwd: string | undefined,
  shell: ScriptShell,
): string | null {
  return running ? null : buildScriptInput(command, cwd, shell);
}
