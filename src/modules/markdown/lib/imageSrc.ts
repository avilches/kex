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

const IMAGE_MD = /(!\[[^\]]*\]\()(<[^>]*>|[^)\s]+)((?:\s+"[^"]*")?\))/g;
const LOCAL_IMAGE_PREFIX = "https://kex-local-image.invalid/?src=";

// The read-only renderer's sanitizer only lets http(s) image URLs through and
// turns a relative one into an origin-relative one before any hook sees it. A
// local image is therefore marked with a placeholder https URL in the markdown
// text itself (fenced code untouched) and swapped back by `resolveLocalImage`.
export function markLocalImages(md: string): string {
  let fence: string | null = null;
  return md
    .split("\n")
    .map((line) => {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
        return line;
      }
      if (m) {
        fence = m[1];
        return line;
      }
      return line.replace(IMAGE_MD, (all, open: string, src: string, close: string) => {
        const bare = src.startsWith("<") ? src.slice(1, -1) : src;
        if (/^(https?:|data:)/i.test(bare)) return all;
        return `${open}<${LOCAL_IMAGE_PREFIX}${encodeURIComponent(bare)}>${close}`;
      });
    })
    .join("\n");
}

export function resolveLocalImage(url: string, filePath: string): string {
  if (!url.startsWith(LOCAL_IMAGE_PREFIX)) return url;
  return resolveMarkdownImageSrc(decodeURIComponent(url.slice(LOCAL_IMAGE_PREFIX.length)), filePath);
}
