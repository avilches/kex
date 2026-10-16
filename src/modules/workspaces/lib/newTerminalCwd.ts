import type { TerminalNewFolderMode } from "@/modules/settings/store";

export type NewTerminalCwdInput = {
  mode: TerminalNewFolderMode;
  /** The user's home directory. */
  home: string | null;
  /** Last folder from the active terminal cwd or editor file directory. */
  lastFolder: string | null;
  /** Static workspace project root (pinned root or filesystem root). */
  workspaceRoot: string | null;
  /** Where Kex was launched from: where the shell opens when no folder is given. */
  launchDir?: string | null;
};

/**
 * Resolves the cwd for a newly opened terminal based on the user's preference.
 * "workspace" falls back to the last folder when the workspace has no project
 * root (the workspaceRoot must be the static pinned/fs root, never ws.cwd which
 * tracks the focused terminal's live directory via OSC 7).
 *
 * When the chosen source has nothing, the result is the launch folder and then home,
 * which is what the shell would pick on its own, so the tab knows its folder from the
 * moment it is created instead of learning it from the first OSC 7.
 */
export function resolveNewTerminalCwd(
  input: NewTerminalCwdInput,
): string | undefined {
  const shellDefault = input.launchDir ?? input.home ?? undefined;
  switch (input.mode) {
    case "home":
      return input.home ?? input.launchDir ?? undefined;
    case "workspace":
      return input.workspaceRoot ?? input.lastFolder ?? shellDefault;
    default:
      return input.lastFolder ?? shellDefault;
  }
}
