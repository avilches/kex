import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import {
  type TextEntry,
  type TextKind,
  TEXT_KINDS,
  isTextEntry,
  parseMarkdown,
  removeEntry,
  renderMarkdown,
  upsertEntry,
} from "../src/settings/devTextEditor/entries";

// Dev-only bridge for the Settings text editor: the webview reads and writes
// SETTINGS_TEXTS.md (repo root) through the dev server, so the file is the one
// source of truth and an agent that applies and deletes entries clears the
// overrides on the next load. Ops are applied to the file's current content.

const FILE_NAME = "SETTINGS_TEXTS.md";

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function settingsTextsPlugin(): Plugin {
  const file = path.resolve(__dirname, "..", FILE_NAME);
  const load = (): TextEntry[] =>
    fs.existsSync(file) ? parseMarkdown(fs.readFileSync(file, "utf8")) : [];

  return {
    name: "kex-settings-texts",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__kex-settings-texts", (req, res) => {
        void (async () => {
          const send = (status: number, payload: unknown) => {
            res.statusCode = status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(payload));
          };
          try {
            if (req.method === "GET") return send(200, { entries: load() });
            if (req.method !== "POST") return send(405, { error: "GET or POST only" });
            const body = JSON.parse(await readBody(req)) as {
              op?: string;
              entry?: unknown;
              kind?: TextKind;
              original?: unknown;
            };
            let entries = load();
            if (body.op === "set") {
              if (!isTextEntry(body.entry)) return send(400, { error: "bad entry" });
              entries = upsertEntry(entries, body.entry);
            } else if (body.op === "remove") {
              if (!TEXT_KINDS.includes(body.kind as TextKind) || typeof body.original !== "string") {
                return send(400, { error: "bad remove" });
              }
              entries = removeEntry(entries, body.kind as TextKind, body.original);
            } else {
              return send(400, { error: "bad op" });
            }
            fs.writeFileSync(file, renderMarkdown(entries));
            server.config.logger.info(`[kex-settings-texts] ${FILE_NAME}: ${entries.length} pending`);
            send(200, { entries });
          } catch (error) {
            send(500, { error: String(error) });
          }
        })();
      });
    },
  };
}
