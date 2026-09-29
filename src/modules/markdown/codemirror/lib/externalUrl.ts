// Relative destinations (`./other.md`, `#anchor`) are not external links; the
// opener capability would reject them anyway, so they are never handed to it.
export function isExternalUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

// Where an autolink's text points: `<https://x.com>` and `https://x.com` are
// their own destination, `www.x.com` gets a scheme and an e-mail address a
// `mailto:`, as GFM defines them.
export function autolinkHref(text: string): string {
  const url = text.trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  if (/^[^\s@]+@[^\s@]+$/.test(url)) return `mailto:${url}`;
  return url;
}

export function openExternalUrl(url: string): void {
  if (!isExternalUrl(url)) return;
  import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url.trim()).catch(console.error));
}
