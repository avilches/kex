import { convertFileSrc } from "@tauri-apps/api/core";
import { pathDirname } from "@/lib/pathUtils";

type Props = {
  content: string;
  path: string;
};

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
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        title="HTML preview"
        className="h-full w-full border-0"
      />
    </div>
  );
}
