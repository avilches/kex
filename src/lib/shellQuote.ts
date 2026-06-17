import { IS_WINDOWS } from "./platform";

export function quoteShellArg(value: string, windows = IS_WINDOWS): string {
  if (windows) {
    // Double quotes work in both cmd.exe and PowerShell for filesystem paths.
    // Single quotes are PowerShell-only and fail silently in cmd.exe.
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
