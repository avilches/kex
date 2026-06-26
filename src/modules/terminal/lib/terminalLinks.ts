import { invoke } from "@tauri-apps/api/core";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { dispatchFileLink, getLeafCwd } from "@/modules/terminal/lib/terminalLinkBridge";

const pathExistsCache = new Map<string, boolean>();

async function pathExists(absPath: string): Promise<boolean> {
  if (pathExistsCache.has(absPath)) return pathExistsCache.get(absPath)!;
  try {
    await invoke("fs_stat", { path: absPath });
    pathExistsCache.set(absPath, true);
    return true;
  } catch {
    pathExistsCache.set(absPath, false);
    return false;
  }
}

function parseFileUri(uri: string): string {
  let path = uri.slice("file://".length);
  const slashIdx = path.indexOf("/");
  if (slashIdx > 0) path = path.slice(slashIdx);
  path = decodeURIComponent(path);
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  return path;
}

const CLAUDE_PATTERNS = [
  /(?:Write|Read|Edit|Update|MultiEdit)\(([^)\n]+)\)/g,
  /Wrote \d+ lines? to ([^\n]+)/g,
];

const PATH_PATTERNS = [
  /(\/[^\s:'"<>()\[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  /(~\/[^\s:'"<>()\[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  /((?:\.\/|\.\.\/)[^\s:'"<>()\[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
];

export function registerTerminalLinks(term: Terminal, getLeafId: () => string | null): () => void {
  term.options.linkHandler = {
    allowNonHttpProtocols: true,
    activate(_event, uri) {
      if (uri.startsWith("file://")) {
        dispatchFileLink(parseFileUri(uri), null);
      } else {
        import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
          openUrl(uri).catch(console.error),
        );
      }
    },
  };

  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const bufferLine = term.buffer.active.getLine(bufferLineNumber - 1);
      if (!bufferLine) {
        callback(undefined);
        return;
      }
      const lineText = bufferLine.translateToString(true);
      const links: ILink[] = [];
      const seen = new Set<string>();
      const promises: Promise<void>[] = [];

      async function addLink(
        rawPath: string,
        start: number,
        end: number,
        lineNum?: number,
        col?: number,
      ): Promise<void> {
        const key = `${start}:${end}`;
        if (seen.has(key)) return;
        seen.add(key);

        const cwd = getLeafCwd(getLeafId());
        let absPath: string;
        if (rawPath.startsWith("/")) {
          absPath = rawPath;
        } else if (rawPath.startsWith("~/")) {
          absPath = rawPath;
        } else {
          if (!cwd) return;
          absPath = `${cwd}/${rawPath}`;
        }

        if (!(await pathExists(absPath))) return;

        links.push({
          range: {
            start: { x: start + 1, y: bufferLineNumber },
            end: { x: end, y: bufferLineNumber },
          },
          text: rawPath,
          decorations: { pointerCursor: true, underline: true },
          activate(event) {
            if (!event.metaKey && !event.ctrlKey) return;
            dispatchFileLink(rawPath, cwd, lineNum, col);
          },
        });
      }

      for (const pattern of CLAUDE_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lineText)) !== null) {
          const untrimmed = match[1];
          const rawPath = untrimmed.trimEnd();
          const offset = match.index + match[0].indexOf(untrimmed);
          promises.push(addLink(rawPath, offset, offset + rawPath.length));
        }
      }

      for (const pattern of PATH_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lineText)) !== null) {
          const rawPath = match[1];
          const lineNum = match[2] ? parseInt(match[2].slice(1), 10) : undefined;
          const col = match[3] ? parseInt(match[3].slice(1), 10) : undefined;
          promises.push(addLink(rawPath, match.index, match.index + match[0].length, lineNum, col));
        }
      }

      Promise.all(promises).then(() => callback(links.length > 0 ? links : undefined));
    },
  };

  const providerDisposable = term.registerLinkProvider(provider);

  return () => {
    term.options.linkHandler = undefined;
    providerDisposable.dispose();
  };
}
