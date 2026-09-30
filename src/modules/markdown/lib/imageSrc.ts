import { convertFileSrc } from "@tauri-apps/api/core";

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(p);
}

// A relative image path resolves against the markdown file's own directory,
// never the workspace root; http(s)/data URLs pass through untouched.
export function resolveMarkdownImageSrc(src: string, filePath: string): string {
  if (/^(https?:|data:)/i.test(src)) return src;
  if (isAbsolutePath(src)) return convertFileSrc(src);
  const dir = filePath.split(/[\\/]/).slice(0, -1).join("/");
  return convertFileSrc(dir ? `${dir}/${src}` : src);
}
