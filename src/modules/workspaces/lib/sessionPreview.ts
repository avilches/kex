export function tildePath(path: string, home: string | null): string {
  const p = path.replace(/\\/g, "/");
  if (!home) return p;
  if (p === home) return "~";
  return p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p;
}

// Keyed by tab id; the IPC is skipped while the same set of terminal tabs is asked for again.
export function previewRequestKey(tabIds: readonly string[]): string {
  return [...tabIds].sort().join("\n");
}
