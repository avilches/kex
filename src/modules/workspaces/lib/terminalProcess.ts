// What a process snapshot shows as "the current process": the command the tab is
// running, else the foreground child of the shell, else the shell itself.
export function processLabel(info: {
  runningCommand: string | null;
  fgName: string | null;
  shellName: string;
}): string {
  const running = (info.runningCommand ?? "").trim().replace(/\s+/g, " ");
  if (running) return running;
  return info.fgName || info.shellName;
}
