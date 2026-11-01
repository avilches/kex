// The one way a restored command is typed into a fresh shell, whether it is an agent resume or the
// Restore Command of a plain terminal: the command as it is, then Enter (CR, as PowerShell needs).
// No leading space, so both land in the shell history alike.
export function typedLine(command: string): string {
  return `${command}\r`;
}
