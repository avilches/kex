import { invoke } from "@tauri-apps/api/core";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { dispatchFileLink, getLeafCwd } from "@/modules/terminal/lib/terminalLinkBridge";

// Set to true to log link detection to the browser console (DevTools)
const DEBUG_LINKS = true;

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

const PATH_PATTERNS: RegExp[] = [
  // Absolute: /path/to/file.ext
  /(\/[^\s:'"<>()\[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  // Home-relative: ~/path/to/file.ext
  /(~\/[^\s:'"<>()\[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  // Explicit relative: ./file.ext or ../file.ext
  /((?:\.\/|\.\.\/)[^\s:'"<>()\[\]{}\\]+\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
  // Bare relative (docs/file.md) or standalone filename (HANDOFF-foo.md).
  // Lookbehind prevents matching inside absolute paths (char before must not be / \w .)
  /(?<![/\w.])([a-zA-Z0-9_][a-zA-Z0-9_.\-/]*\.[a-zA-Z]{1,10})(:\d+)?(:\d+)?/g,
];

export function registerTerminalLinks(term: Terminal, getLeafId: () => string | null): () => void {
  if (DEBUG_LINKS) {
    console.log("[links] registerTerminalLinks called, term.element:", term.element?.tagName ?? "null");
    term.element?.addEventListener("mousemove", () => {
      console.log("[links] mousemove reaches term.element");
    }, { once: true });
    const screen = term.element?.querySelector(".xterm-screen");
    console.log("[links] .xterm-screen:", screen?.tagName ?? "not found");
    screen?.addEventListener("mousemove", () => {
      console.log("[links] mousemove reaches .xterm-screen");
    }, { once: true });
  }
  term.options.linkHandler = {
    allowNonHttpProtocols: true,
    activate(_event, uri) {
      if (uri.startsWith("file://")) {
        const path = parseFileUri(uri);
        if (DEBUG_LINKS) console.log(`[links] OSC8 file click: "${path}"`);
        dispatchFileLink(path, null);
      } else {
        if (DEBUG_LINKS) console.log(`[links] OSC8 url click: "${uri}"`);
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
      if (DEBUG_LINKS && lineText.trim()) console.log(`[links] provideLinks line ${bufferLineNumber}: ${JSON.stringify(lineText)}`);
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
          if (!cwd) {
            if (DEBUG_LINKS) console.log(`[links] skip "${rawPath}" — no cwd`);
            return;
          }
          absPath = `${cwd}/${rawPath}`;
        }

        if (DEBUG_LINKS) console.log(`[links] stat "${absPath}"`);
        if (!(await pathExists(absPath))) {
          if (DEBUG_LINKS) console.log(`[links] ✗ "${absPath}"`);
          return;
        }
        if (DEBUG_LINKS) console.log(`[links] ✓ "${rawPath}"`);

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

      for (const pattern of PATH_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lineText)) !== null) {
          const rawPath = match[1];
          const lineNum = match[2] ? parseInt(match[2].slice(1), 10) : undefined;
          const col = match[3] ? parseInt(match[3].slice(1), 10) : undefined;
          if (DEBUG_LINKS) console.log(`[links] path match: "${rawPath}"`);
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
