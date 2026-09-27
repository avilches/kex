// Relative destinations (`./other.md`, `#anchor`) are not external links; the
// opener capability would reject them anyway, so they are never handed to it.
export function isExternalUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

export function openExternalUrl(url: string): void {
  if (!isExternalUrl(url)) return;
  import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url.trim()).catch(console.error));
}
