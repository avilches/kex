import { convertFileSrc } from "@tauri-apps/api/core";
import { pathDirname } from "@/lib/pathUtils";

type Props = {
  content: string;
  path: string;
};

// srcDoc inherits the parent's origin, so allow-same-origin here would hand
// any <script> in the previewed HTML the parent's window.__TAURI_INTERNALS__
// and full IPC (fs, shell, git). Local assets still load fine without it:
// the injected <base> tag points relative paths at the asset:// origin, a
// plain cross-origin resource fetch that sandboxing does not affect.
export const PREVIEW_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";

export function injectBase(html: string, baseUrl: string): string {
  const baseTag = `<base href="${baseUrl}">`;
  const match = html.match(/<head[^>]*>/i);
  if (match?.index !== undefined) {
    const insertAt = match.index + match[0].length;
    return html.slice(0, insertAt) + baseTag + html.slice(insertAt);
  }
  return baseTag + html;
}

export function HtmlPreviewPane({ content, path }: Props) {
  const dirPath = pathDirname(path);
  const baseUrl = convertFileSrc(dirPath) + "/";
  const contentWithBase = injectBase(content, baseUrl);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-white">
      <iframe
        srcDoc={contentWithBase}
        sandbox={PREVIEW_SANDBOX}
        title="HTML preview"
        className="h-full w-full border-0"
      />
    </div>
  );
}
