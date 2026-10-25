import { IS_WINDOWS } from "@/lib/platform";
import type { ScriptCwdMode } from "./types";

export type ScriptShell = "posix" | "powershell";

export type ScriptCwdInput = {
  mode: ScriptCwdMode | undefined;
  fixedFolder?: string;
  /** Folder of the focused tab, with the agent worktree already applied. */
  focusFolder?: string | null;
  workspaceRoot?: string | null;
  workspaceCwd?: string | null;
  /** The user's home folder; absent until it is known, and the terminal then starts where it always does. */
  home?: string | null;
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
    case "workspace":
      return workspaceFolder;
    default:
      return present(input.home);
  }
}

// Two folders are the same when the canonical strings match: no trailing separator and, for
// Windows paths (any path on Windows, or one that looks like a drive or UNC path), separators
// folded to forward slashes and case folded, since those folders are case-insensitive on
// disk. On POSIX a backslash is an ordinary name character. A symlinked folder that resolves
// elsewhere reads as a different folder, which is the safe side.
export function folderKey(p: string | null | undefined): string {
  if (!p) return "";
  if (!(IS_WINDOWS || /^([A-Za-z]:[\\/]|\\\\)/.test(p))) return p.replace(/\/+$/, "");
  const q = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return q.toLowerCase();
}

export function equalFolder(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return a === b;
  return folderKey(a) === folderKey(b);
}

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
