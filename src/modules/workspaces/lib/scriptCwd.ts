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

// cmd.exe is not told apart from PowerShell: a Windows workspace is assumed to
// run PowerShell, so a cmd.exe tab gets PowerShell syntax and the cd fails.
export function buildScriptInput(
  command: string,
  cwd: string | undefined,
  shell: ScriptShell,
): string {
  if (!cwd || /[\r\n]/.test(cwd)) return command + "\r";
  if (shell === "powershell") {
    const literal = `'${cwd.replace(/'/g, "''")}'`;
    return `Set-Location -LiteralPath ${literal}; if ($?) { ${command} }\r`;
  }
  return `cd ${quoteShellArg(cwd, false)} && ${command}\r`;
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
