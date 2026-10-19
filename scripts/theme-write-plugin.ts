import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// Dev-only bridge so the theme preview can write a theme back to its source
// file. The preview runs in a plain browser (no Tauri), so the write has to go
// through the Vite dev server. It only touches src/modules/theme/themes/<id>.ts
// and edits the exact lines that changed, keeping the diff small.

const COLOR_KEYS: Record<string, string> = {
  background: "background",
  foreground: "foreground",
  card: "card",
  "card-foreground": "cardForeground",
  popover: "popover",
  "popover-foreground": "popoverForeground",
  primary: "primary",
  "primary-foreground": "primaryForeground",
  secondary: "secondary",
  "secondary-foreground": "secondaryForeground",
  muted: "muted",
  "muted-foreground": "mutedForeground",
  accent: "accent",
  "accent-foreground": "accentForeground",
  destructive: "destructive",
  border: "border",
  input: "input",
  ring: "ring",
  sidebar: "sidebar",
  "sidebar-foreground": "sidebarForeground",
  "sidebar-primary": "sidebarPrimary",
  "sidebar-primary-foreground": "sidebarPrimaryForeground",
  "sidebar-accent": "sidebarAccent",
  "sidebar-accent-foreground": "sidebarAccentForeground",
  "sidebar-border": "sidebarBorder",
  "sidebar-ring": "sidebarRing",
  "tab-focus-indicator": "tabFocusIndicator",
  link: "link",
};

const TERMINAL_KEYS: Record<string, string> = {
  "terminal-background": "background",
  "terminal-foreground": "foreground",
  "terminal-cursor": "cursor",
  "terminal-cursor-accent": "cursorAccent",
  "terminal-selection": "selection",
};

const EDITOR_KEYS: Record<string, string> = {
  "editor-background": "background",
  "editor-foreground": "foreground",
};

const ANSI_ORDER = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright-black", "bright-red", "bright-green", "bright-yellow",
  "bright-blue", "bright-magenta", "bright-cyan", "bright-white",
];

type Block = { bodyStart: number; end: number };

function skipNonCode(source: string, i: number): number {
  const ch = source[i];
  if (ch === '"' || ch === "'" || ch === "`") {
    i++;
    while (i < source.length) {
      if (source[i] === "\\") i += 2;
      else if (source[i] === ch) return i + 1;
      else i++;
    }
    return i;
  }
  if (ch === "/" && source[i + 1] === "/") {
    while (i < source.length && source[i] !== "\n") i++;
    return i;
  }
  if (ch === "/" && source[i + 1] === "*") {
    i += 2;
    while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
    return i + 2;
  }
  return i;
}

function findBlock(source: string, key: string): Block | null {
  const re = new RegExp(`(^|[\\s,{])${key}\\s*:\\s*\\{`);
  const m = re.exec(source);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < source.length) {
    const next = skipNonCode(source, i);
    if (next !== i) {
      i = next;
      continue;
    }
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return { bodyStart, end: i };
    }
    i++;
  }
  return null;
}

function findArray(source: string, key: string): Block | null {
  const re = new RegExp(`(^|[\\s,{])${key}\\s*:\\s*\\[`);
  const m = re.exec(source);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < source.length) {
    const next = skipNonCode(source, i);
    if (next !== i) {
      i = next;
      continue;
    }
    if (source[i] === "[") depth++;
    else if (source[i] === "]") {
      depth--;
      if (depth === 0) return { bodyStart, end: i };
    }
    i++;
  }
  return null;
}

function replaceBody(text: string, block: Block, body: string): string {
  return text.slice(0, block.bodyStart) + body + text.slice(block.end);
}

type PatchResult = { replaced: string[]; inserted: string[]; missing: string[] };

function setKey(body: string, childIndent: string, key: string, value: string, result: PatchResult): string {
  const re = new RegExp(`((?:^|[\\s,{])${key}\\s*:\\s*)"[^"]*"`);
  if (re.test(body)) {
    result.replaced.push(key);
    return body.replace(re, `$1"${value}"`);
  }
  result.inserted.push(key);
  return body.replace(/\n(\s*)$/, (_m, closeIndent) => `\n${childIndent}${key}: "${value}",\n${closeIndent}`);
}

function setNthString(body: string, index: number, value: string): string | null {
  const re = /"[^"]*"/g;
  let i = 0;
  let match: RegExpExecArray | null = re.exec(body);
  while (match) {
    if (i === index) return body.slice(0, match.index) + `"${value}"` + body.slice(match.index + match[0].length);
    i++;
    match = re.exec(body);
  }
  return null;
}

function childIndentOf(body: string): string {
  const m = /^\n(\s+)/.exec(body);
  return m ? m[1] : "  ";
}

export function patchThemeSource(source: string, mode: string, tokens: Record<string, string>): { source: string; result: PatchResult; error?: string } {
  const result: PatchResult = { replaced: [], inserted: [], missing: [] };
  const variant = findBlock(source, mode);
  if (!variant) return { source, result, error: `no "${mode}" variant in the file` };

  let body = source.slice(variant.bodyStart, variant.end);

  const colorChanges = Object.entries(tokens).filter(([t]) => COLOR_KEYS[t]);
  if (colorChanges.length) {
    const colors = findBlock(body, "colors");
    if (colors) {
      let b = body.slice(colors.bodyStart, colors.end);
      const indent = childIndentOf(b);
      for (const [token, value] of colorChanges) b = setKey(b, indent, COLOR_KEYS[token], value, result);
      body = replaceBody(body, colors, b);
    } else {
      for (const [token] of colorChanges) result.missing.push(token);
    }
  }

  const terminalChanges = Object.entries(tokens).filter(([t]) => TERMINAL_KEYS[t]);
  const ansiChanges = Object.entries(tokens).filter(([t]) => t.startsWith("terminal-ansi-"));
  if (terminalChanges.length || ansiChanges.length) {
    const terminal = findBlock(body, "terminal");
    if (terminal) {
      let b = body.slice(terminal.bodyStart, terminal.end);
      const indent = childIndentOf(b);
      for (const [token, value] of terminalChanges) b = setKey(b, indent, TERMINAL_KEYS[token], value, result);
      for (const [token, value] of ansiChanges) {
        const name = token.slice("terminal-ansi-".length);
        const index = ANSI_ORDER.indexOf(name);
        const array = findArray(b, "ansi");
        if (index < 0 || !array) {
          result.missing.push(token);
          continue;
        }
        const arrayBody = b.slice(array.bodyStart, array.end);
        const next = setNthString(arrayBody, index, value);
        if (next === null) result.missing.push(token);
        else {
          result.replaced.push(token);
          b = replaceBody(b, array, next);
        }
      }
      body = replaceBody(body, terminal, b);
    } else {
      for (const [token] of [...terminalChanges, ...ansiChanges]) result.missing.push(token);
    }
  }

  const editorChanges = Object.entries(tokens).filter(([t]) => EDITOR_KEYS[t]);
  if (editorChanges.length) {
    let editor = findBlock(body, "editor");
    if (!editor) {
      const indent = childIndentOf(body);
      const inner = indent + "  ";
      const inserted = editorChanges.map(([token, value]) => `${inner}${EDITOR_KEYS[token]}: "${value}",`).join("\n");
      body = body.replace(/\n(\s*)$/, (_m, closeIndent) => `\n${indent}editor: {\n${inserted}\n${indent}},\n${closeIndent}`);
      for (const [token] of editorChanges) result.inserted.push(token);
    } else {
      let b = body.slice(editor.bodyStart, editor.end);
      const indent = childIndentOf(b);
      for (const [token, value] of editorChanges) b = setKey(b, indent, EDITOR_KEYS[token], value, result);
      body = replaceBody(body, editor, b);
    }
  }

  return { source: source.slice(0, variant.bodyStart) + body + source.slice(variant.end), result };
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function themeWritePlugin(): Plugin {
  const themesDir = path.resolve(__dirname, "../src/modules/theme/themes");
  return {
    name: "kex-theme-write",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__kex-theme-write", (req, res) => {
        void (async () => {
          const send = (status: number, payload: unknown) => {
            res.statusCode = status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(payload));
          };
          if (req.method !== "POST") return send(405, { error: "POST only" });
          try {
            const raw = await readBody(req);
            const { id, mode, tokens } = JSON.parse(raw) as { id: string; mode: string; tokens: Record<string, string> };
            if (!/^[a-z0-9-]+$/.test(id ?? "")) return send(400, { error: "bad theme id" });
            if (mode !== "dark" && mode !== "light") return send(400, { error: "bad mode" });
            if (!tokens || typeof tokens !== "object" || Object.keys(tokens).length === 0) return send(400, { error: "no changes" });
            const file = path.resolve(themesDir, `${id}.ts`);
            if (path.dirname(file) !== themesDir) return send(400, { error: "bad theme id" });
            if (!fs.existsSync(file)) return send(404, { error: `src/modules/theme/themes/${id}.ts does not exist` });
            const source = fs.readFileSync(file, "utf8");
            const patched = patchThemeSource(source, mode, tokens);
            if (patched.error) return send(422, { error: patched.error });
            if (patched.source === source) return send(409, { error: "nothing matched, file left untouched" });
            fs.writeFileSync(file, patched.source);
            server.config.logger.info(`[kex-theme-write] ${path.relative(server.config.root, file)}: ${patched.result.replaced.length} replaced, ${patched.result.inserted.length} inserted, ${patched.result.missing.length} missing`);
            send(200, { file: `src/modules/theme/themes/${id}.ts`, ...patched.result });
          } catch (error) {
            send(500, { error: String(error) });
          }
        })();
      });
    },
  };
}
