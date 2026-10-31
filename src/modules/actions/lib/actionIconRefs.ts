import { EDITOR_CATALOG } from "@/modules/external-editors/catalog";
import { AGENT_LOGO_IDS } from "@/modules/agents/lib/agentLogos";
import type { ActionKind } from "./types";

export { AGENT_LOGO_IDS };

/** The glyph names, in the order the picker shows them; the components live in actionIcons.ts. */
export const GLYPH_NAMES = [
  "ai-idea",
  "app-window",
  "bot",
  "browser",
  "brain",
  "bug",
  "calendar",
  "clock",
  "cloud",
  "code",
  "code-square",
  "terminal",
  "console",
  "cpu",
  "database",
  "file",
  "flash",
  "folder",
  "git-branch",
  "globe",
  "home",
  "image",
  "key",
  "link",
  "lock",
  "magic-wand",
  "mail",
  "notebook",
  "package",
  "pen-tool",
  "play",
  "robot",
  "rocket",
  "search",
  "server",
  "settings",
  "shield",
  "sparkles",
  "star",
  "wrench",
] as const;

export type GlyphName = (typeof GLYPH_NAMES)[number];

export type ActionIconRef =
  | { source: "app"; id: string }
  | { source: "agent"; id: string }
  | { source: "glyph"; name: GlyphName };

const GLYPH_SET = new Set<string>(GLYPH_NAMES);

/** Catalog ids that ship an icon file; the rest would draw the generic fallback after two failed requests. */
const NO_ICON_FILE = new Set(["trae-solo", "android-studio-canary"]);
const ICON_APPS = EDITOR_CATALOG.filter((e) => !NO_ICON_FILE.has(e.id));
export const ICON_APP_IDS: readonly string[] = ICON_APPS.map((e) => e.id);
const APP_SET = new Set(ICON_APP_IDS);
const AGENT_SET = new Set(AGENT_LOGO_IDS);

/** The stored form is `app:<id>`, `agent:<id>` or `glyph:<name>`; anything else is not an icon. */
export function parseIcon(value: string | undefined | null): ActionIconRef | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at < 0) return null;
  const source = value.slice(0, at);
  const id = value.slice(at + 1);
  if (source === "app" && APP_SET.has(id)) return { source, id };
  if (source === "agent" && AGENT_SET.has(id)) return { source, id };
  if (source === "glyph" && GLYPH_SET.has(id)) return { source, name: id as GlyphName };
  return null;
}

export function formatIcon(ref: ActionIconRef): string {
  return ref.source === "glyph" ? `glyph:${ref.name}` : `${ref.source}:${ref.id}`;
}

export type IconOption = { ref: ActionIconRef; value: string; label: string; keywords: string[] };

const option = (ref: ActionIconRef, label: string, keywords: string[] = []): IconOption => ({
  ref,
  value: formatIcon(ref),
  label,
  keywords: [label.toLowerCase(), ...keywords],
});

const words = (name: string) => name.replace(/-/g, " ");

/** Every icon a picker may offer. Agents lead for an agent, glyphs lead for a script. */
export function iconOptions(kind: ActionKind): IconOption[] {
  const glyphs = GLYPH_NAMES.map((name) => option({ source: "glyph", name }, words(name), ["glyph", "icon"]));
  const apps = ICON_APPS.map((e) => option({ source: "app", id: e.id }, e.name, ["app", e.group.toLowerCase()]));
  const agents = AGENT_LOGO_IDS.map((id) => option({ source: "agent", id }, id, ["agent", "logo"]));
  if (kind === "agent") return [...agents, ...glyphs, ...apps];
  if (kind === "app") return [...apps, ...glyphs, ...agents];
  return [...glyphs, ...apps, ...agents];
}

/** Case-insensitive match over the label and keywords; an empty query keeps everything. */
export function filterIcons(options: readonly IconOption[], query: string): IconOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((o) => o.keywords.some((k) => k.includes(q)));
}
