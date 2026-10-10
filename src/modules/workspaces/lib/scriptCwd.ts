import { quoteShellArg } from "@/lib/shellQuote";
import type { ScriptCwdMode } from "./types";

export type ScriptCwdInput = {
  mode: ScriptCwdMode | undefined;
  fixedFolder?: string;
  /** Folder of the focused tab, with the agent worktree already applied. */
  focusFolder?: string | null;
  workspaceRoot?: string | null;
  workspaceCwd?: string | null;
};

export function resolveScriptCwd(input: ScriptCwdInput): string | undefined {
  const workspaceFolder = input.workspaceRoot ?? input.workspaceCwd ?? undefined;
  switch (input.mode) {
    case "context":
      return input.focusFolder ?? workspaceFolder;
    case "fixed":
      return input.fixedFolder?.trim() || workspaceFolder;
    default:
      return workspaceFolder;
  }
}

// Windows shells differ (PowerShell 5.1 has no `&&`), so there the cd is its
// own line, sent in the same write.
export function buildScriptInput(
  command: string,
  cwd: string | undefined,
  windows: boolean,
): string {
  if (!cwd) return command + "\r";
  const cd = `cd ${quoteShellArg(cwd, windows)}`;
  return windows ? `${cd}\r${command}\r` : `${cd} && ${command}\r`;
}
