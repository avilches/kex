import { invoke } from "@tauri-apps/api/core";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { dispatchFileLink, getLeafCwd } from "@/modules/terminal/lib/terminalLinkBridge";

const pathExistsCache = new Map<string, boolean>();

async function pathExists(absPath: string): Promise<boolean> {
  const cached = pathExistsCache.get(absPath);
  if (cached !== undefined) return cached;
  try {
    await invoke("fs_stat", { path: absPath });
    pathExistsCache.set(absPath, true);
    return true;
  } catch {
    // Don't cache failures: the file may not exist yet (e.g. being generated)
    // and caching false would prevent detecting it on the next hover.
    return false;
  }
}

export function parseFileUri(uri: string): string {
  let path = uri.slice("file://".length);
  const slashIdx = path.indexOf("/");
  if (slashIdx > 0) path = path.slice(slashIdx);
  path = decodeURIComponent(path);
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  return path;
}

const PATH_PATTERNS: RegExp[] = [
  // Absolute: /path/to/file.ext
  /(\/[^\s:'"<>()[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  // Home-relative: ~/path/to/file.ext
  /(~\/[^\s:'"<>()[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  // Explicit relative: ./file.ext or ../file.ext
  /((?:\.\/|\.\.\/)[^\s:'"<>()[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  // Bare relative (docs/file.md) or standalone filename (HANDOFF-foo.md).
  // Lookbehind prevents matching inside absolute paths (char before must not be / \w .)
  /(?<![/\w.])([a-zA-Z0-9_][a-zA-Z0-9_.\-/]*\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
];

export function registerTerminalLinks(term: Terminal, getLeafId: () => string | null): () => void {
  // Consume OSC 8 file:// hyperlinks before xterm's built-in OscLinkProvider can
  // turn them into clickable links. A real file:// OSC link (emitted e.g. by Claude
  // Code) opens Finder on click regardless of our linkHandler. By suppressing the
  // built-in link, the path text stays plain and is detected by our regex provider
  // below, which opens it in the editor. http(s) OSC links are left untouched.
  const oscDisposable = term.parser.registerOscHandler(8, (data) => {
    const sep = data.indexOf(";");
    const uri = sep >= 0 ? data.slice(sep + 1) : "";
    return uri.startsWith("file://");
  });

  term.options.linkHandler = {
    allowNonHttpProtocols: true,
    activate(event, uri) {
      event.preventDefault();
      if (uri.startsWith("file://")) {
        dispatchFileLink(parseFileUri(uri), null, undefined, undefined, getLeafId() ?? undefined);
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
            dispatchFileLink(rawPath, cwd, lineNum, col, getLeafId() ?? undefined);
          },
        });
      }

      for (const pattern of PATH_PATTERNS) {
        pattern.lastIndex = 0;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop pattern
        for (let match: RegExpExecArray | null; (match = pattern.exec(lineText)) !== null;) {
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
    oscDisposable.dispose();
  };
}
