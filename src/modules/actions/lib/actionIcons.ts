import {
  AiIdeaIcon,
  AppWindowIcon,
  BotIcon,
  BrowserIcon,
  Brain01Icon,
  Bug01Icon,
  Calendar01Icon,
  Clock01Icon,
  CloudIcon,
  CodeIcon,
  CodeSquareIcon,
  ComputerTerminal01Icon,
  ConsoleIcon,
  CpuIcon,
  Database01Icon,
  File01Icon,
  FlashIcon,
  Folder01Icon,
  GitBranchIcon,
  GlobeIcon,
  Home01Icon,
  Image01Icon,
  Key01Icon,
  Link01Icon,
  LockIcon,
  MagicWand01Icon,
  MailIcon,
  Notebook01Icon,
  PackageIcon,
  PenTool01Icon,
  PlayIcon,
  Rocket01Icon,
  RoboticIcon,
  Search01Icon,
  ServerStack01Icon,
  Settings01Icon,
  Shield01Icon,
  SparklesIcon,
  StarIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { EDITOR_CATALOG } from "@/modules/external-editors/catalog";
import type { ActionKind } from "./types";

type HugeIcon = typeof AppWindowIcon;

/** A closed list, so a stored name always resolves and the bundle only carries these. */
export const GLYPHS = {
  "ai-idea": AiIdeaIcon,
  "app-window": AppWindowIcon,
  bot: BotIcon,
  browser: BrowserIcon,
  brain: Brain01Icon,
  bug: Bug01Icon,
  calendar: Calendar01Icon,
  clock: Clock01Icon,
  cloud: CloudIcon,
  code: CodeIcon,
  "code-square": CodeSquareIcon,
  terminal: ComputerTerminal01Icon,
  console: ConsoleIcon,
  cpu: CpuIcon,
  database: Database01Icon,
  file: File01Icon,
  flash: FlashIcon,
  folder: Folder01Icon,
  "git-branch": GitBranchIcon,
  globe: GlobeIcon,
  home: Home01Icon,
  image: Image01Icon,
  key: Key01Icon,
  link: Link01Icon,
  lock: LockIcon,
  "magic-wand": MagicWand01Icon,
  mail: MailIcon,
  notebook: Notebook01Icon,
  package: PackageIcon,
  "pen-tool": PenTool01Icon,
  play: PlayIcon,
  robot: RoboticIcon,
  rocket: Rocket01Icon,
  search: Search01Icon,
  server: ServerStack01Icon,
  settings: Settings01Icon,
  shield: Shield01Icon,
  sparkles: SparklesIcon,
  star: StarIcon,
  wrench: Wrench01Icon,
} as const satisfies Record<string, HugeIcon>;

export type GlyphName = keyof typeof GLYPHS;

export type ActionIconRef =
  | { source: "app"; id: string }
  | { source: "agent"; id: string }
  | { source: "glyph"; name: GlyphName };

const GLYPH_NAMES = new Set<string>(Object.keys(GLYPHS));
const APP_IDS = new Set(EDITOR_CATALOG.map((e) => e.id));

/** Agent logos AgentIcon draws; any other id gets its generic robot, so only these are offered. */
export const AGENT_LOGO_IDS: readonly string[] = [
  "claude",
  "gemini",
  "omp",
  "agy",
  "grok",
  "openclaude",
  "pi",
  "opencode",
  "codex",
  "goose",
  "aider",
  "cursor-agent",
  "kex",
];
const AGENT_IDS = new Set(AGENT_LOGO_IDS);

/** The stored form is `app:<id>`, `agent:<id>` or `glyph:<name>`; anything else is not an icon. */
export function parseIcon(value: string | undefined | null): ActionIconRef | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at < 0) return null;
  const source = value.slice(0, at);
  const id = value.slice(at + 1);
  if (source === "app" && APP_IDS.has(id)) return { source, id };
  if (source === "agent" && AGENT_IDS.has(id)) return { source, id };
  if (source === "glyph" && GLYPH_NAMES.has(id)) return { source, name: id as GlyphName };
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
  const glyphs = (Object.keys(GLYPHS) as GlyphName[]).map((name) =>
    option({ source: "glyph", name }, words(name), ["glyph", "icon"]),
  );
  const apps = EDITOR_CATALOG.map((e) => option({ source: "app", id: e.id }, e.name, ["app", e.group.toLowerCase()]));
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

export function glyphIcon(name: GlyphName): HugeIcon {
  return GLYPHS[name];
}
