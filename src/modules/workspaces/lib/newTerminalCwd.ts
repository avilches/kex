import type { TerminalNewFolderMode } from "@/modules/settings/store";

export type NewTerminalCwdInput = {
  mode: TerminalNewFolderMode;
  /** The user's home directory. */
  home: string | null;
  /** Last folder from the active terminal cwd or editor file directory. */
  lastFolder: string | null;
  /** Static workspace project root (pinned root or filesystem root). */
  workspaceRoot: string | null;
};

/**
 * Resolves the cwd for a newly opened terminal based on the user's preference.
 * "workspace" falls back to the last folder when the workspace has no project
 * root (the workspaceRoot must be the static pinned/fs root, never ws.cwd which
 * tracks the focused terminal's live directory via OSC 7).
 */
export function resolveNewTerminalCwd(
  input: NewTerminalCwdInput,
): string | undefined {
  switch (input.mode) {
    case "home":
      return input.home ?? undefined;
    case "workspace":
      return input.workspaceRoot ?? input.lastFolder ?? undefined;
    default:
      return input.lastFolder ?? undefined;
  }
}
