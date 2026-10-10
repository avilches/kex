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

export function scriptShellFor(
  isWindows: boolean,
  envKind: string,
): ScriptShell {
  return isWindows && envKind !== "wsl" ? "powershell" : "posix";
}

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
  if (!isSafeScriptCwd(cwd)) {
    throw new Error("script folder contains a control character");
  }
  if (shell === "powershell") {
    const literal = `'${cwd.replace(POWERSHELL_QUOTES, (q) => q + q)}'`;
    return `Set-Location -LiteralPath ${literal}; if ($?) { ${command}\n\n}\r`;
  }
  return `cd ${quoteShellArg(cwd, false)} && { ${command}\n\n}\r`;
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
