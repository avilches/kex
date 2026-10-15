/**
 * The folder Rust reported for a freshly opened PTY: the folder the shell
 * actually started in, known before the first OSC 7. Null when the PTY had no
 * folder to report (a WSL spawn without a cwd) or it matches the last known
 * one, meaning the tab needs no update.
 */
export function spawnCwdUpdate(
  lastCwd: string | null,
  reported: string | null,
): string | null {
  if (!reported || reported === lastCwd) return null;
  return reported;
}