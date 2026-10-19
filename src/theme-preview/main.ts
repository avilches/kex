import "../styles/globals.css";

import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ChevronRightIcon,
  CommandLineIcon,
  CrosshairIcon,
  FolderTreeIcon,
  GitBranchIcon,
  Moon02Icon,
  PinIcon,
  Refresh01Icon,
  RemoveSquareIcon,
  Search01Icon,
  SleepingIcon,
  SquareArrowDown02Icon,
  SquareArrowDown03Icon,
  SquareArrowUp02Icon,
  Sun03Icon,
  UnfoldMoreIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { applyTheme } from "@/modules/theme/applyTheme";
import { listBuiltinThemes, listTerminalOnlyThemes } from "@/modules/theme/themes";
import { validateTheme } from "@/modules/theme/validateTheme";
import { EDITOR_THEME_EXT } from "@/modules/editor/lib/themes";
import { readEditorThemeSurface } from "@/modules/editor/lib/editorThemeSurface";
import {
  buildLivePreviewExtensions,
  buildStaticPreviewExtensions,
} from "@/modules/markdown/codemirror/lib/markdownExtensions";
import {
  EDITOR_THEME_LABELS,
  EDITOR_THEMES,
  isEditorThemeId,
  TERMINAL_THEME_AUTO,
} from "@/modules/settings/store";
import { resolveTerminalPalette, terminalThemeOptions } from "@/modules/theme/resolveTerminalTheme";
import markdownDemo from "./live-preview-demo.md?raw";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import type { GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import type { TerminalPalette, Theme, ThemeColors, ThemeMode } from "@/modules/theme/types";
import { fileIcon, folderIcon, icon } from "./icons";
import { toHex, tokenValue } from "./color";
import {
  applyTokens,
  applyTune,
  clearOverrides,
  DEFAULT_TUNE,
  loadTokens,
  loadTune,
  readTune,
  saveTokens,
  saveTune,
  tuneSnapshot,
  type Tune,
} from "./tuner";

type Scheme = "vscode" | "jetbrains";

const params = new URLSearchParams(location.search);
const state = {
  themeId: params.get("theme") ?? "kex-default",
  mode: (params.get("mode") === "light" ? "light" : "dark") as ThemeMode,
  scheme: (params.get("scheme") === "jetbrains" ? "jetbrains" : "vscode") as Scheme,
  view: (["app", "swatches"].includes(params.get("view") ?? "") ? params.get("view") : "swatches") as
    | "app"
    | "swatches",
  terminal: params.get("terminal") ?? TERMINAL_THEME_AUTO,
  editor: params.get("editor") ?? "auto",
  custom: null as Theme | null,
  tune: { ...DEFAULT_TUNE } as Tune,
  tokens: {} as Record<string, string>,
};

const tuneKey = (): string => `${state.themeId}|${state.mode}`;
state.tune = loadTune(tuneKey());
state.tokens = loadTokens(tuneKey());

const ANSI_NAMES = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright-black", "bright-red", "bright-green", "bright-yellow",
  "bright-blue", "bright-magenta", "bright-cyan", "bright-white",
];

const TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover",
  "popover-foreground", "primary", "primary-foreground", "secondary",
  "secondary-foreground", "muted", "muted-foreground", "accent",
  "accent-foreground", "destructive", "border", "input", "ring", "sidebar",
  "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border",
  "sidebar-ring", "tab-focus-indicator", "link", "editor-background", "editor-foreground", "note-editor-background", "note-editor-foreground", "note-terminal-background", "note-terminal-foreground", "terminal-background",
  "terminal-foreground", "terminal-cursor", "terminal-cursor-accent",
  "terminal-selection", ...ANSI_NAMES.map((n) => `terminal-ansi-${n}`),
];

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

const NORMAL_TEXT = "color:var(--px-normal-text)";
const IGNORED_TEXT = "color:var(--px-ignored-text)";

function swatch(label: string, css: string): HTMLElement {
  const hex = toHex(css);
  return h(
    "div",
    { class: "flex items-center gap-2 text-[11px]", "data-token": label, "data-hex": hex },
    h("span", { class: "size-5 shrink-0 rounded border border-border", style: `background:${css}` }),
    h("span", { class: "w-44 shrink-0 truncate text-muted-foreground" }, label),
    h("span", { class: "font-mono" }, hex),
  );
}

function section(title: string, ...kids: Node[]): HTMLElement {
  return h(
    "section",
    { class: "mb-6", "data-section": title },
    h("h2", { class: "mb-2 text-[13px] font-semibold text-foreground" }, title),
    ...kids,
  );
}

function iconButton(iconData: Parameters<typeof icon>[0], size = 13, strokeWidth?: number, title?: string): HTMLElement {
  const btn = h("button", { class: "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground" });
  if (title) btn.title = title;
  btn.append(icon(iconData, size, strokeWidth));
  return btn;
}

// ---------------------------------------------------------------------------
// Explorer

type TreeNode = { name: string; dir?: boolean; expanded?: boolean; depth: number; ignored?: boolean; selected?: boolean };

const TREE: TreeNode[] = [
  { name: ".claude", dir: true, expanded: true, depth: 0 },
  { name: "scratch", dir: true, depth: 1 },
  { name: "skills", dir: true, depth: 1 },
  { name: "worktrees", dir: true, expanded: true, depth: 1 },
  { name: "naming-refactor", dir: true, depth: 2 },
  { name: "palette-adversarial", dir: true, depth: 2 },
  { name: "task-829-zoom-slider", dir: true, depth: 2 },
  { name: ".DS_Store", depth: 2, ignored: true },
  { name: ".git", dir: true, depth: 0 },
  { name: ".github", dir: true, depth: 0 },
  { name: ".idea", dir: true, ignored: true, depth: 0 },
  { name: ".superpowers", dir: true, ignored: true, depth: 0 },
  { name: "docs", dir: true, depth: 0 },
  { name: "src", dir: true, depth: 0 },
  { name: "target", dir: true, ignored: true, depth: 0 },
  { name: "CLAUDE.md", depth: 0 },
  { name: "GEMINI.md", depth: 0, selected: true },
  { name: "kex.json", depth: 0 },
  { name: "NEXT.md", depth: 0 },
  { name: "HANDOFF-2026-06-25-20-30-terminal-links.md", depth: 0, ignored: true },
  { name: "break-remote.sh", depth: 0, ignored: true },
  { name: ".DS_Store", depth: 0, ignored: true },
  { name: "node_modules", dir: true, ignored: true, depth: 0 },
  { name: "dist", dir: true, ignored: true, depth: 0 },
  { name: "dist-ssr", dir: true, ignored: true, depth: 0 },
  { name: "stats.html", depth: 0, ignored: true },
  { name: "user-data", dir: true, ignored: true, depth: 0 },
];

function treeRow(node: TreeNode): HTMLElement {
  const rowState = node.selected
    ? "bg-accent text-foreground"
    : node.ignored
      ? ""
      : "";
  const colorStyle = node.selected ? "" : node.ignored ? IGNORED_TEXT : NORMAL_TEXT;
  const hex = node.selected ? toHex("var(--foreground)") : node.ignored ? `${toHex("var(--muted-foreground)")}` : `${toHex("var(--foreground)")}`;
  const disclosure = h("span", { class: "flex size-3.5 shrink-0 items-center justify-center text-muted-foreground" });
  if (node.dir) {
    const arrow = icon(ArrowRight01Icon, 12, 2.25);
    arrow.style.transform = node.expanded ? "rotate(90deg)" : "";
    disclosure.append(arrow);
  }
  return h(
    "button",
    {
      class: `group relative flex h-6 w-full min-w-0 items-center gap-2 rounded-sm px-1.5 text-left text-[13px] transition-colors hover:bg-accent/70 ${rowState}`,
      style: `padding-left:${6 + node.depth * 12}px`,
      "data-file": node.name,
      "data-state": node.selected ? "selected" : node.ignored ? "ignored" : "normal",
      "data-hex": hex,
      "data-alpha": node.selected ? "1" : node.ignored ? String(state.tune.ignoredAlpha) : String(state.tune.normalAlpha),
    },
    disclosure,
    node.dir ? folderIcon(node.name, !!node.expanded) : fileIcon(node.name),
    h("span", { class: "min-w-0 flex-1 truncate", style: colorStyle }, node.name),
    h("span", { class: "shrink-0 pl-2 font-mono text-[10px] text-muted-foreground" }, hex),
  );
}

function explorerPanel(): HTMLElement {
  const header = h(
    "div",
    { class: "flex h-8 shrink-0 items-center gap-1 px-1.5" },
    h(
      "button",
      { class: "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground" },
      h("span", { class: "shrink-0 text-primary" }, icon(PinIcon, 13, 2)),
      h("span", { class: "truncate" }, "Workspace Root"),
      h("span", { class: "shrink-0" }, icon(ArrowDown01Icon, 12, 2)),
    ),
    iconButton(Search01Icon, 13, 2, "Search"),
    iconButton(CrosshairIcon, 13, 2, "Focus active tab"),
    iconButton(ViewIcon, 13, 2, "Hidden files"),
    iconButton(Refresh01Icon, 12, 2, "Refresh"),
  );
  const tree = h("div", { class: "flex flex-col gap-px px-1 pb-1" }, ...TREE.map(treeRow));
  return h("div", { class: "flex min-h-0 flex-1 flex-col", "data-panel": "explorer" }, header, tree);
}

// ---------------------------------------------------------------------------
// Source control

type ScmRow = { name: string; code: GitStatusCode };

const SCM_ROWS: ScmRow[] = [
  { name: "GEMINI.md", code: "U" },
  { name: "kex.json", code: "U" },
  { name: "NEXT.md", code: "U" },
  { name: "src/app/App.tsx", code: "M" },
  { name: "docs/old-fork.md", code: "D" },
];

function scmRow(row: ScmRow): HTMLElement {
  const color = gitStatusHexColor(row.code, state.scheme, state.mode) ?? undefined;
  const name = h(
    "span",
    { class: "min-w-0 flex-1 truncate text-[13px] font-medium", style: color ? `color:${color}` : "" },
    row.name,
  );
  if (row.code === "D") name.style.textDecoration = "line-through";
  return h(
    "div",
    { class: "group flex h-6 items-center gap-2 rounded-sm pl-1.5 pr-2 text-[13px] transition-colors hover:bg-accent/30", "data-file": row.name, "data-hex": color ? toHex(color) : "" },
    fileIcon(row.name.split("/").pop() ?? row.name),
    name,
    h("span", { class: "w-5 shrink-0 text-center font-mono text-[11px] font-bold leading-none", style: color ? `color:${color}` : "" }, row.code),
  );
}

function sourceControlPanel(): HTMLElement {
  const remote = (iconData: Parameters<typeof icon>[0], size: number, strokeWidth: number) => {
    const btn = h("button", { class: "flex h-6 min-w-6 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" });
    btn.append(icon(iconData, size, strokeWidth));
    return btn;
  };
  const commitTextarea = h("textarea", {
    class: "min-h-[60px] w-full resize-none rounded-lg border-0 bg-transparent px-3 pb-6 pt-2.5 text-[12.5px] leading-snug text-foreground outline-none placeholder:text-muted-foreground/65",
    placeholder: "Commit message",
  });
  return h(
    "div",
    { class: "flex min-h-0 flex-1 flex-col", "data-panel": "source-control" },
    h(
      "div",
      { class: "flex shrink-0 flex-col gap-1 border-b border-border/60 px-2 py-1.5" },
      h(
        "span",
        { class: "inline-flex w-fit max-w-full min-w-0 items-center gap-1 rounded bg-muted/55 px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground" },
        h("span", { class: "overflow-hidden text-ellipsis whitespace-nowrap" }, "~/Hub/Projects/Kex"),
      ),
      h(
        "div",
        { class: "flex h-6 min-w-0 items-center gap-1.5" },
        h(
          "button",
          { class: "inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-tight text-foreground transition-colors hover:bg-foreground/10" },
          h("span", { class: "shrink-0 text-muted-foreground" }, icon(GitBranchIcon, 14, 1.9)),
          h("span", { class: "truncate" }, "main"),
        ),
        h("div", { class: "ml-auto flex shrink-0 items-center gap-0.5" }, remote(SquareArrowDown03Icon, 17, 1.85), remote(SquareArrowDown02Icon, 17, 1.9), remote(SquareArrowUp02Icon, 17, 1.9)),
      ),
    ),
    h(
      "div",
      { class: "relative shrink-0 space-y-2 border-b border-border/40 bg-gradient-to-b from-card/65 to-card/30 px-2.5 pb-2.5 pt-2.5" },
      h(
        "div",
        { class: "relative rounded-lg border border-border/45 bg-background/95 shadow-sm focus-within:border-primary/45" },
        commitTextarea,
        h(
          "div",
          { class: "pointer-events-none absolute inset-x-3 bottom-1.5 flex items-center justify-between gap-2 p-1 text-[10px] text-muted-foreground/55" },
          h("span", { class: "flex items-center gap-2" }, "⌘↩", h("span", {}, "to commit")),
        ),
      ),
      h(
        "div",
        { class: "flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground" },
        h("span", { class: "size-1.5 shrink-0 rounded-full bg-muted-foreground/30" }),
        h("span", { class: "truncate font-medium text-foreground/85" }, "Nothing staged"),
        h("span", { class: "ml-auto shrink-0 truncate text-muted-foreground/65" }, "origin/main"),
      ),
      h(
        "div",
        { class: "flex w-full items-center gap-2" },
        h("button", { class: "h-7 flex-1 rounded-md bg-primary text-[11.5px] font-semibold tracking-tight text-primary-foreground shadow-sm" }, "Commit"),
        h(
          "label",
          { class: "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground" },
          h("span", { class: "size-3.5 shrink-0 rounded border border-border" }),
          "Push",
        ),
      ),
    ),
    h(
      "div",
      { class: "flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border/40 px-2" },
      h("span", { class: "min-w-0 truncate text-[10.5px] font-medium text-muted-foreground", "data-changed-count": String(SCM_ROWS.length) }, `${SCM_ROWS.length} changed`),
      h("div", { class: "flex shrink-0 items-center gap-0.5" },
        iconButton(UnfoldMoreIcon, 14, 1.85, "Expand all"),
        iconButton(FolderTreeIcon, 14, 1.85, "View mode"),
        iconButton(Refresh01Icon, 14, 1.9, "Refresh"),
      ),
    ),
    h(
      "div",
      { class: "group flex h-[30px] shrink-0 select-none items-center gap-2 px-2 hover:bg-accent/20" },
      h("span", { class: "shrink-0 text-muted-foreground" }, icon(ArrowDown01Icon, 10, 2.3)),
      h("span", { class: "text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85" }, "Changes"),
      h("div", { class: "ml-auto flex shrink-0 items-center gap-0.5 opacity-70" },
        iconButton(RemoveSquareIcon, 11, 1.9, "Discard all"),
        iconButton(Add01Icon, 11, 1.9, "Stage all"),
      ),
      h("span", { class: "flex w-5 shrink-0 items-center justify-center" },
        h("span", { class: "inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-[9.5px] font-semibold tabular-nums text-muted-foreground" }, String(SCM_ROWS.length)),
      ),
    ),
    h("div", { class: "flex flex-col gap-px px-1" }, ...SCM_ROWS.map(scmRow)),
  );
}

// ---------------------------------------------------------------------------
// Sidebar frame

function sidebarFrame(active: "Explorer" | "Git", body: HTMLElement): HTMLElement {
  const tab = (label: string) =>
    h("span", { class: label === active ? "rounded bg-sidebar-primary px-2 py-0.5 text-sidebar-primary-foreground" : "rounded px-2 py-0.5 opacity-70" }, label);
  return h(
    "div",
    { class: "flex w-[300px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground" },
    h("div", { class: "flex shrink-0 gap-1 px-1.5 py-1.5 text-[11px]" }, tab("Explorer"), tab("Git"), tab("History"), tab("Notes")),
    body,
  );
}

// ---------------------------------------------------------------------------
// Workspace bar

type TabRow = { title: string; kind: "terminal" | "file"; focused?: boolean };

function workspaceItem(opts: { title: string; active?: boolean; hibernated?: boolean; expanded?: boolean; tabs?: TabRow[] }): HTMLElement {
  const row = h(
    "button",
    {
      class: `flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] font-semibold transition-all ${opts.hibernated ? "relative overflow-hidden " : ""}${opts.active ? "text-foreground" : "bg-foreground/[0.09] text-muted-foreground hover:bg-foreground/[0.14] hover:text-foreground"}`,
      style: opts.active ? "box-shadow:inset 0 0 0 1px var(--ring)" : "",
      "data-workspace": opts.title,
      "data-active": String(!!opts.active),
    },
    opts.hibernated ? h("span", { class: "ws-hib-look absolute inset-0" }) : "",
    h("span", { class: "min-w-0 flex-1 truncate" }, opts.title),
    opts.hibernated ? h("span", { class: "shrink-0 opacity-60" }, icon(SleepingIcon, 13, 1.75)) : "",
  );
  const wrap = h("div", { class: "flex w-full flex-col gap-px px-1.5" }, row);
  if (opts.expanded && opts.tabs) {
    const list = h("div", { class: "ml-3 mt-0.5 flex flex-col gap-px border-l border-border/60 pl-0.5" });
    for (const t of opts.tabs) {
      list.append(
        h(
          "div",
          {
            class: `relative flex h-6 w-full items-center gap-1.5 rounded-md pl-2 pr-1.5 text-left text-[12px] ${t.focused ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/[0.08]"}`,
            style: t.focused ? "box-shadow:inset 0 0 0 1px var(--ring)" : "",
            "data-tab": t.title,
          },
          h("span", { class: "flex size-3.5 shrink-0 items-center justify-center" },
            t.kind === "terminal" ? icon(CommandLineIcon, 13, 1.75) : fileIcon(t.title)),
          h("span", { class: "min-w-0 truncate" }, t.title),
        ),
      );
    }
    wrap.append(list);
  }
  return wrap;
}

function workspaceBar(): HTMLElement {
  const tabs = (list: [string, "terminal" | "file"][], focusedTitle?: string): TabRow[] =>
    list.map(([title, kind]) => ({ title, kind, focused: title === focusedTitle }));
  const newButton = h("button", { class: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 text-lg text-muted-foreground hover:border-border hover:text-foreground" }, "+");
  return h(
    "nav",
    { class: "flex w-[260px] shrink-0 flex-col gap-1.5 border-r border-border/60 bg-card/60 py-1.5", "data-panel": "workspace-bar" },
    h(
      "div",
      { class: "flex w-full items-center gap-1 px-3 pt-2 pb-0.5 text-left" },
      h("span", { class: "shrink-0 rotate-90 text-muted-foreground/60" }, icon(ChevronRightIcon, 10, 2)),
      h("span", { class: "truncate text-[11px] font-medium text-muted-foreground/60" }, "Projects"),
      h("span", { class: "ml-auto shrink-0 text-[10px] text-muted-foreground/40" }, "3"),
    ),
    workspaceItem({
      title: "Projects",
      expanded: true,
      tabs: tabs([
        ["Vuelo Verano 2026.md", "file"],
        ["Neceser viajes.md", "file"],
        ["IA.md", "file"],
        ["Learning English.md", "file"],
        ["My projects.md", "file"],
        ["Obsidian.md", "file"],
      ]),
    }),
    workspaceItem({
      title: "demo-git",
      active: true,
      expanded: true,
      tabs: tabs(
        [
          ["demo-git · main", "terminal"],
          ["package.json in Kex", "file"],
          ["demo-git · main", "terminal"],
          ["~/Work/Proy/Repos/demo-gitde...", "terminal"],
          ["file-tiptap.md", "file"],
        ],
        "~/Work/Proy/Repos/demo-gitde...",
      ),
    }),
    workspaceItem({ title: "old", hibernated: true }),
    h("div", { class: "mt-1 flex justify-center" }, newButton),
  );
}

// ---------------------------------------------------------------------------
// Header, tab bar, panes

function header(): HTMLElement {
  return h(
    "div",
    { class: "flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-foreground" },
    h("span", { class: "text-[12px] font-medium" }, "kex / main"),
    h("span", { class: "text-[12px] text-muted-foreground" }, "Terminal 1"),
    h("span", { class: "ml-auto rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground" }, "Run"),
  );
}

function tabBar(): HTMLElement {
  const tab = (label: string, cls: string, dot = "") =>
    h("div", { class: `flex items-center gap-1.5 rounded px-2 py-1 text-[12px] ${cls}` }, h("span", {}, label), dot ? h("span", { class: dot }) : "");
  const active = tab("active", "bg-background text-foreground ring-1 ring-tab-focus-indicator");
  const gitTab = tab("modified.ts", "bg-muted/40");
  const gitHex = gitStatusHexColor("M", state.scheme, state.mode);
  if (gitHex) (gitTab.firstElementChild as HTMLElement).style.color = gitHex;
  return h(
    "div",
    { class: "flex flex-wrap items-center gap-1 rounded-md border border-border bg-card px-1 py-1 text-muted-foreground" },
    active,
    tab("idle", "bg-muted/40"),
    tab("working", "bg-muted/40", "ml-0.5 size-[11px] animate-spin rounded-full border-2 border-transparent border-t-primary"),
    tab("attention", "bg-muted/40", "ml-0.5 inline-block size-[6px] rounded-full bg-amber-400"),
    tab("restore error", "bg-muted/40 text-destructive/70", "ml-0.5 inline-block size-[6px] rounded-full bg-destructive"),
    gitTab,
  );
}

type PaneKind = "terminal" | "editor";

function dimFor(kind: PaneKind): number {
  return currentTheme().variants[state.mode]?.inactivePaneDim?.[kind] ?? 0;
}

function ansi(name: string, text: string): HTMLElement {
  return h("span", { style: `color:var(--terminal-ansi-${name})`, "data-ansi": name }, text);
}

function terminalBody(focused: boolean): HTMLElement {
  const v = (n: string) => `var(--terminal-${n})`;
  const line = (...kids: (Node | string)[]) => h("div", { class: "whitespace-pre" }, ...kids);
  const prompt = () => [ansi("green", "~/kex"), " ", ansi("blue", "main"), " ❯ "];
  const cursor = h("span", {
    style: focused ? `background:${v("cursor")};color:${v("cursor-accent")}` : `outline:1px solid ${v("cursor")};outline-offset:-1px`,
    "data-part": "cursor",
  }, " ");
  const chips = (from: number) =>
    ANSI_NAMES.slice(from, from + 8).map((n) =>
      h("span", { style: `background:${v(`ansi-${n}`)};color:${v("background")}`, class: "px-1", "data-ansi": n }, n.replace("bright-", "b-").slice(0, 5)),
    );
  return h(
    "div",
    { class: "p-2 font-mono text-[12px] leading-[1.5]", style: `background:${v("background")};color:${v("foreground")}` },
    line(...prompt(), "git status"),
    line("On branch main"),
    line("Changes not staged for commit:"),
    line(ansi("red", "        modified:   src/app.ts")),
    line(ansi("green", "        new file:   src/theme.ts")),
    line(ansi("yellow", "warning:"), " LF will be replaced by CRLF"),
    line(...prompt(), "pnpm test ", h("span", { style: `background:${v("selection")}`, "data-part": "selection" }, "--watch"), cursor),
    line(...chips(0)),
    line(...chips(8)),
  );
}

function activeEditorId(theme: Theme): keyof typeof EDITOR_THEME_EXT {
  if (isEditorThemeId(state.editor)) return state.editor;
  const pair = theme.editorTheme?.[state.mode] ?? theme.editorTheme?.dark;
  return isEditorThemeId(pair) ? pair : state.mode === "light" ? "github-light" : "atomone";
}

function editorBody(focused: boolean): HTMLElement {
  const theme = currentTheme();
  const id = activeEditorId(theme);
  const host = h("div", { "data-editor-theme": id, style: "background:var(--editor-background);color:var(--editor-foreground)" });
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: 'import { greet } from "./greet";\n\nexport function main(name: string) {\n  // active line + selection\n  const msg = greet(name);\n  return `hello ${msg}` + 42;\n}\n',
      extensions: [lineNumbers(), highlightActiveLine(), javascript({ typescript: true }), EDITOR_THEME_EXT[id], EditorView.theme({ "&, &.cm-editor": { backgroundColor: "var(--editor-background) !important" }, ".cm-gutters": { backgroundColor: "transparent !important" } })],
      selection: { anchor: 68, head: 82 },
    }),
  });
  view.dom.classList.toggle("cm-focused", focused);
  return host;
}

function pane(kind: PaneKind, focused: boolean): HTMLElement {
  const dim = focused ? 0 : dimFor(kind);
  const overlay = (): Node | string =>
    dim > 0 ? h("div", { class: "pointer-events-none absolute inset-0 z-10 bg-black", style: `opacity:${dim}` }) : "";
  const strip = h(
    "div",
    { class: "relative flex items-center gap-1 border-b border-border bg-card px-1 py-1 text-[12px]" },
    h(
      "div",
      { class: "relative rounded bg-background px-2 py-1 text-foreground" },
      focused ? h("span", { class: "absolute inset-x-0 top-0 h-0.5 rounded-t bg-tab-focus-indicator" }) : "",
      kind === "terminal" ? "zsh" : "main.ts",
    ),
    h("div", { class: "px-2 py-1 text-muted-foreground" }, kind === "terminal" ? "server" : "greet.ts"),
    overlay(),
  );
  const body = h("div", { class: "relative" }, kind === "terminal" ? terminalBody(focused) : editorBody(focused), overlay());
  return h(
    "div",
    { class: "min-w-[360px] flex-1 overflow-hidden rounded-md border border-border", "data-pane": kind, "data-focused": String(focused), "data-dim": String(dim) },
    strip, body,
    h("div", { class: "border-t border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground" }, `${kind} ${focused ? "focused" : "unfocused"}, dim ${dim}`),
  );
}

const markdownViews: { rich?: EditorView; preview?: EditorView } = {};

function markdownPane(label: "Rich" | "Preview"): HTMLElement {
  const id = activeEditorId(currentTheme());
  const identity = (src: string) => src;
  const extensions = label === "Rich" ? buildLivePreviewExtensions(identity) : buildStaticPreviewExtensions(identity);
  const host = h("div", { class: "h-[420px] overflow-auto", style: "background:var(--editor-background);color:var(--editor-foreground)" });
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: markdownDemo, extensions: [EDITOR_THEME_EXT[id], ...extensions], selection: { anchor: markdownDemo.length } }),
  });
  if (label === "Rich") markdownViews.rich = view;
  else markdownViews.preview = view;
  return h(
    "div",
    { class: "min-w-[360px] flex-1 overflow-hidden rounded-md border border-border", "data-pane": `markdown-${label.toLowerCase()}`, "data-editor-theme": id },
    h("div", { class: "flex items-center gap-1 border-b border-border bg-card px-2 py-1 text-[12px]" },
      h("span", { class: "rounded bg-background px-2 py-1 text-foreground" }, label === "Rich" ? "notes.md" : "Preview")),
    host,
  );
}

// ---------------------------------------------------------------------------
// App frame

function appFrame(focus: PaneKind): HTMLElement {
  return h(
    "div",
    { class: "flex min-h-[520px] overflow-hidden rounded-lg border border-border bg-background", "data-view": "app", "data-focus": focus },
    workspaceBar(),
    sidebarFrame("Explorer", explorerPanel()),
    sidebarFrame("Git", sourceControlPanel()),
    h(
      "div",
      { class: "flex min-w-0 flex-1 flex-col gap-2 p-2" },
      header(),
      tabBar(),
      h("div", { class: "flex min-h-0 flex-1 flex-wrap gap-2" }, pane("terminal", focus === "terminal"), pane("editor", focus === "editor")),
      h("div", { class: "flex min-h-0 flex-wrap gap-2" }, markdownPane("Rich"), markdownPane("Preview")),
    ),
  );
}

function appView(): HTMLElement {
  const titled = (title: string, frame: HTMLElement) =>
    h("div", { class: "mb-4" }, h("div", { class: "mb-1 text-[11px] text-muted-foreground" }, title), frame);
  return h(
    "div",
    {},
    titled("Terminal pane focused, editor pane unfocused, Live Preview below", appFrame("terminal")),
    titled("Editor pane focused, terminal pane unfocused", appFrame("editor")),
    titled(
      "Hibernated workspace: chip in the bar and overlay",
      h("div", { class: "flex gap-2 rounded-lg border border-border bg-background p-2", "data-view": "hibernated" }, workspaceBar(), hibernatedOverlay()),
    ),
  );
}

// Copies HibernatedOverlay.tsx at rest: the .hib-wash tint only exists during
// the entrance animation, so it is drawn here as a strip to show its color.
function hibernatedOverlay(): HTMLElement {
  return h(
    "div",
    { class: "relative flex h-[300px] flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-md border border-border bg-background text-muted-foreground", "data-surface": "hibernated-overlay" },
    h("div", { class: "size-16 rounded-full border border-current opacity-70" }),
    h("span", { class: "text-[15px] text-foreground" }, "kex"),
    h("span", { class: "text-[12px]" }, "Hibernated for 2h"),
    h("span", { class: "rounded-md bg-primary px-4 py-1.5 text-[13px] text-primary-foreground" }, "Restore"),
    h("span", { class: "hib-wash", style: "inset:auto 0 0 0;height:18px", "data-surface": "hibernated-wash" }),
  );
}

// ---------------------------------------------------------------------------
// Theme bar, controls, tuner

function allThemes(): Theme[] {
  return [...listBuiltinThemes(), ...(state.custom ? [state.custom] : [])];
}

function currentTheme(): Theme {
  const all = allThemes();
  return all.find((t) => t.id === state.themeId) ?? all[0];
}

function selectTheme(index: number): void {
  const all = allThemes();
  const theme = all[(index + all.length) % all.length];
  const mode: ThemeMode = theme.variants[state.mode] ? state.mode : "dark";
  set({ themeId: theme.id, mode });
}

function cycleTheme(delta: number): void {
  const all = allThemes();
  const i = all.findIndex((t) => t.id === state.themeId);
  selectTheme((i < 0 ? 0 : i) + delta);
}

function themeBar(): HTMLElement {
  const themes = allThemes();
  const row = h("div", { class: "flex flex-wrap items-center gap-1" });
  themes.forEach((t, i) => {
    const active = t.id === state.themeId;
    const btn = h(
      "button",
      { class: `flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] ${active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}` },
      h("span", { class: "size-2.5 shrink-0 rounded-full border border-black/20", style: `background:${t.variants[state.mode]?.colors?.primary ?? "#888"}` }),
      t.name,
    );
    btn.onclick = () => selectTheme(i);
    row.append(btn);
  });
  const modeBtn = (mode: ThemeMode, iconData: Parameters<typeof icon>[0], label: string) => {
    const b = h("button", { class: `flex items-center gap-1 rounded border px-2 py-1 text-[12px] ${state.mode === mode ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}` });
    b.append(icon(iconData, 13, 2), label);
    b.onclick = () => set({ mode });
    return b;
  };
  return h(
    "div",
    { class: "mb-3 flex flex-col gap-2" },
    h("div", { class: "flex flex-wrap items-center gap-2" },
      h("span", { class: "text-[11px] text-muted-foreground" }, "Themes (Left/Right cycles, Up/Down switches mode):"),
      modeBtn("dark", Moon02Icon, "dark"),
      modeBtn("light", Sun03Icon, "light"),
    ),
    row,
  );
}

function controls(): HTMLElement {
  const themes = allThemes();
  const terminalSelect = h("select", { class: "rounded border border-border bg-transparent px-2 py-1 text-[12px]", title: "Terminal theme" });
  terminalSelect.append(h("option", { value: TERMINAL_THEME_AUTO }, "terminal: auto"));
  for (const o of terminalThemeOptions([...themes, ...listTerminalOnlyThemes()], state.mode)) {
    terminalSelect.append(h("option", { value: o.id }, `terminal: ${o.name}`));
  }
  terminalSelect.value = state.terminal;
  terminalSelect.onchange = () => set({ terminal: terminalSelect.value });
  const editorSelect = h("select", { class: "rounded border border-border bg-transparent px-2 py-1 text-[12px]", title: "Editor theme" });
  editorSelect.append(h("option", { value: "auto" }, "editor: auto"));
  for (const id of EDITOR_THEMES) editorSelect.append(h("option", { value: id }, `editor: ${EDITOR_THEME_LABELS[id]}`));
  editorSelect.value = state.editor;
  editorSelect.onchange = () => set({ editor: editorSelect.value });
  const btn = (label: string, on: boolean, fn: () => void) => {
    const b = h("button", { class: `rounded border border-border px-2 py-1 text-[12px] ${on ? "bg-primary text-primary-foreground" : ""}` }, label);
    b.onclick = fn;
    return b;
  };
  const area = h("textarea", { class: "h-16 w-full rounded border border-border bg-transparent p-1 font-mono text-[11px]", placeholder: "Paste a user theme JSON here" });
  const err = h("div", { class: "text-[11px] text-destructive" });
  const load = h("button", { class: "rounded border border-border px-2 py-1 text-[12px]" }, "Load custom theme");
  load.onclick = () => {
    try {
      const r = validateTheme(JSON.parse(area.value));
      if (!r.ok) return void (err.textContent = r.error);
      set({ themeId: r.theme.id, custom: r.theme });
    } catch (e) {
      err.textContent = String(e);
    }
  };
  return h(
    "div",
    { class: "mb-4 flex flex-col gap-2" },
    h("div", { class: "flex flex-wrap items-center gap-2" },
      terminalSelect,
      editorSelect,
      btn("vs code git colors", state.scheme === "vscode", () => set({ scheme: "vscode" })),
      btn("jetbrains git colors", state.scheme === "jetbrains", () => set({ scheme: "jetbrains" })),
      btn("swatches view", state.view === "swatches", () => set({ view: "swatches" })),
      btn("app view", state.view === "app", () => set({ view: "app" })),
    ),
    area, load, err,
  );
}

type SliderField = "bgLightness" | "bgHue" | "normalAlpha" | "ignoredAlpha";

function smallButton(label: string): HTMLButtonElement {
  return h("button", { class: "shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground" }, label) as HTMLButtonElement;
}

function slider(opts: {
  label: string;
  field: SliderField;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onInput: (v: number) => void;
}): { node: HTMLElement; sync: () => void } {
  const input = h("input", { type: "range", class: "w-52 grow", min: String(opts.min), max: String(opts.max), step: String(opts.step) }) as HTMLInputElement;
  const out = h("span", { class: "w-14 shrink-0 text-right font-mono text-[11px]" });
  const reset = smallButton("reset");
  reset.title = "Back to the theme default for this one";
  const sync = () => {
    input.value = String(state.tune[opts.field]);
    out.textContent = opts.format(state.tune[opts.field]);
  };
  input.oninput = () => {
    const v = Number(input.value);
    out.textContent = opts.format(v);
    opts.onInput(v);
  };
  reset.onclick = () => opts.onInput(DEFAULT_TUNE[opts.field]);
  sync();
  return {
    node: h("div", { class: "flex items-center gap-2 text-[11px]" }, h("span", { class: "w-40 shrink-0 text-muted-foreground" }, opts.label), input, out, reset),
    sync,
  };
}

function tunerPanel(): HTMLElement {
  const readout = h("div", { class: "flex flex-wrap gap-4 font-mono text-[11px]" });
  const paintReadout = () => {
    const r = readTune(state.tune);
    readout.replaceChildren(
      h("span", {}, `sidebar ${r.surface}`),
      h("span", { "data-read": "normal", "data-hex": r.normal.hex }, `normal ${r.normal.hex} ${r.normal.ratio.toFixed(2)}:1`),
      h("span", { "data-read": "ignored", "data-hex": r.ignored.hex }, `ignored ${r.ignored.hex} ${r.ignored.ratio.toFixed(2)}:1`),
    );
  };

  const sliders: { sync: () => void }[] = [];
  const tokenRows: { sync: () => void }[] = [];
  const exportArea = h("textarea", { class: "h-40 w-full rounded border border-border bg-transparent p-1 font-mono text-[11px]", readonly: "true" }) as HTMLTextAreaElement;
  let exportIsChanges = true;

  const snapshot = () => tuneSnapshot(state.themeId, currentTheme().name, state.mode, state.tune, readTune(state.tune), changedTokens());

  const syncAll = () => {
    sliders.forEach((s) => s.sync());
    tokenRows.forEach((t) => t.sync());
  };
  const refresh = () => {
    paint();
    paintReadout();
    syncAll();
    exportArea.value = exportIsChanges ? snapshot() : fullThemeJson();
  };
  const patch = (p: Partial<Tune>) => {
    state.tune = { ...state.tune, ...p };
    saveTune(tuneKey(), state.tune);
    refresh();
  };
  const setToken = (name: string, value: string) => {
    state.tokens = { ...state.tokens, [name]: value };
    saveTokens(tuneKey(), state.tokens);
    refresh();
  };
  const clearToken = (name: string) => {
    const next = { ...state.tokens };
    delete next[name];
    state.tokens = next;
    saveTokens(tuneKey(), state.tokens);
    refresh();
  };

  const addSlider = (label: string, field: SliderField, min: number, max: number, step: number, format: (v: number) => string): HTMLElement => {
    const s = slider({ label, field, min, max, step, format, onInput: (v) => patch({ [field]: v } as Partial<Tune>) });
    sliders.push(s);
    return s.node;
  };

  const tokenRow = (name: string): HTMLElement => {
    const color = h("input", { type: "color", class: "size-6 shrink-0 rounded border border-border" }) as HTMLInputElement;
    const text = h("input", { type: "text", class: "w-24 shrink-0 rounded border border-border bg-transparent px-1 font-mono text-[11px]" }) as HTMLInputElement;
    const reset = smallButton("reset");
    const row = h("div", { class: "flex items-center gap-2", "data-token-row": name },
      color, text, h("span", { class: "min-w-0 flex-1 truncate text-[11px]" }, name), reset);
    const sync = () => {
      const hex = state.tokens[name] ?? toHex(tokenValue(name));
      color.value = hex.slice(0, 7);
      if (document.activeElement !== text) text.value = hex;
      text.placeholder = baseline[name] ?? "";
      row.dataset.changed = String(name in state.tokens);
    };
    color.oninput = () => setToken(name, color.value);
    text.onchange = () => {
      const v = text.value.trim().toLowerCase();
      if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) setToken(name, v);
      else sync();
    };
    reset.onclick = () => clearToken(name);
    tokenRows.push({ sync });
    return row;
  };

  const tokenGrid = h("div", { class: "grid grid-cols-1 gap-1 xl:grid-cols-2" }, ...TOKENS.map(tokenRow));
  const tokenDetails = h("details", { class: "rounded border border-border p-1.5" },
    h("summary", { class: "cursor-pointer text-[11px] font-medium" }, "Any token (buttons included). Pick a color or type a hex, with alpha if you want."),
    h("div", { class: "mt-2" }, tokenGrid),
  );

  const resetAll = smallButton("Reset all");
  resetAll.title = "Back to the theme defaults, drops the token overrides too";
  resetAll.onclick = () => {
    state.tune = { ...DEFAULT_TUNE };
    saveTune(tuneKey(), state.tune);
    state.tokens = {};
    saveTokens(tuneKey(), {});
    refresh();
  };

  const copyStatus = h("span", { class: "text-[11px] text-muted-foreground" });
  const copy = async (getText: () => string, isChanges: boolean) => {
    exportIsChanges = isChanges;
    const text = getText();
    exportArea.value = text;
    try {
      await navigator.clipboard.writeText(text);
      copyStatus.textContent = isChanges ? "Copied the changes. Paste it back to me and I bake it in." : "Copied the full theme. You can also paste it in the box above as a custom theme.";
    } catch {
      exportArea.select();
      copyStatus.textContent = "Clipboard blocked. The JSON is in the box, copy it by hand.";
    }
  };
  const copyChanges = smallButton("Export changes (copy)");
  copyChanges.onclick = () => void copy(snapshot, true);
  const copyFull = smallButton("Export full theme (copy)");
  copyFull.onclick = () => void copy(fullThemeJson, false);

  const saveStatus = h("span", { class: "text-[11px] text-muted-foreground" });
  const saveBtn = smallButton("Save to disk");
  saveBtn.title = "Write these values into src/modules/theme/themes/<id>.ts (pnpm dev only)";
  const restore = (tune: Tune, tokens: Record<string, string>) => {
    state.tune = tune;
    state.tokens = tokens;
    saveTune(tuneKey(), tune);
    saveTokens(tuneKey(), tokens);
    refresh();
  };
  saveBtn.onclick = async () => {
    const changes = effectiveChanges();
    if (Object.keys(changes).length === 0) {
      saveStatus.textContent = "Nothing changed since the theme loaded.";
      return;
    }
    // Writing the file makes Vite reload this page right away, which kills this
    // handler before it can react to the response, so drop the overrides now:
    // the theme on disk already carries them and a stale tune would just be
    // reapplied on top on reload. They are restored if the write fails.
    const previous = { tune: state.tune, tokens: state.tokens };
    saveBtn.disabled = true;
    clearOverrides(tuneKey());
    state.tune = { ...DEFAULT_TUNE };
    state.tokens = {};
    saveStatus.textContent = "Writing...";
    try {
      const res = await fetch("/__kex-theme-write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: state.themeId, mode: state.mode, tokens: changes }),
      });
      const json = (await res.json()) as { file?: string; replaced?: string[]; inserted?: string[]; missing?: string[]; error?: string };
      if (!res.ok) {
        restore(previous.tune, previous.tokens);
        saveBtn.disabled = false;
        saveStatus.textContent = `Not written: ${json.error ?? res.statusText}`;
        return;
      }
      saveStatus.textContent = `Wrote ${json.file}: ${json.replaced?.length ?? 0} changed, ${json.inserted?.length ?? 0} added, ${json.missing?.length ?? 0} skipped.`;
    } catch (error) {
      restore(previous.tune, previous.tokens);
      saveBtn.disabled = false;
      saveStatus.textContent = `Not written: ${String(error)}. Is the page served by pnpm dev?`;
    }
  };

  paintReadout();
  syncAll();
  exportArea.value = snapshot();

  return section(
    "Tuner (changes are saved per theme and mode, and survive a reload)",
    h("div", { class: "flex flex-col gap-1.5" },
      addSlider("Background lightness", "bgLightness", -15, 15, 0.5, (v) => `${v > 0 ? "+" : ""}${v}%`),
      addSlider("Background tone (warm/cool)", "bgHue", -40, 40, 1, (v) => `${v > 0 ? "+" : ""}${v}deg`),
      addSlider("Normal text alpha", "normalAlpha", 0.5, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
      addSlider("Ignored text alpha", "ignoredAlpha", 0.4, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
      readout,
      h("div", { class: "flex flex-wrap items-center gap-2" }, resetAll, copyChanges, copyFull, saveBtn, copyStatus),
      saveStatus,
      exportArea,
      tokenDetails,
    ),
  );
}

// ---------------------------------------------------------------------------
// Render

// Token hexes as the theme declares them, captured before the tone sliders and
// the manual overrides touch anything, so the export can tell what changed.
let baseline: Record<string, string> = {};

function paint(): void {
  const theme = currentTheme();
  document.documentElement.classList.toggle("dark", state.mode === "dark");
  document.documentElement.classList.toggle("light", state.mode === "light");
  applyTheme(
    theme,
    state.mode,
    resolveTerminalPalette(state.terminal, theme, [...allThemes(), ...listTerminalOnlyThemes()], state.mode),
    isEditorThemeId(state.editor) ? readEditorThemeSurface(state.editor) : undefined,
  );
  baseline = {};
  for (const t of TOKENS) {
    const declared = tokenValue(t);
    if (declared) baseline[t] = toHex(declared);
  }
  applyTune(state.tune);
  applyTokens(state.tokens);
  document.documentElement.dataset.previewTheme = theme.id;
  document.documentElement.dataset.previewTerminal = state.terminal;
  document.documentElement.dataset.previewMode = state.mode;
}

function changedTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(state.tokens)) {
    if (baseline[name]?.toLowerCase() !== value.toLowerCase()) out[name] = value;
  }
  return out;
}

// Tokens whose on-screen value differs from what the theme declares, which is
// what "Save to disk" writes: every UI color the tone sliders moved or that was
// overridden by hand, plus the terminal and editor tokens only when they were
// overridden by hand (they alias the UI colors in CSS, so they would otherwise
// look changed on their own).
function effectiveChanges(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of TOKENS) {
    const current = toHex(tokenValue(token));
    if (!baseline[token] || current.toLowerCase() === baseline[token].toLowerCase()) continue;
    const explicit = token in state.tokens;
    if (token in COLOR_TOKEN || explicit) out[token] = current;
  }
  return out;
}

const COLOR_TOKEN: Record<string, keyof ThemeColors> = {
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

// The whole theme with the on-screen values baked in, so it can be pasted into
// the "Load custom theme" box or handed over to be written into the theme file.
function fullThemeJson(): string {
  const theme: Theme = structuredClone(currentTheme());
  const variant = theme.variants[state.mode] ?? theme.variants.dark ?? theme.variants.light;
  if (!variant) return JSON.stringify(theme, null, 2);
  const colors = { ...(variant.colors ?? {}) };
  for (const [token, key] of Object.entries(COLOR_TOKEN)) colors[key] = toHex(tokenValue(token));
  variant.colors = colors;
  const terminal: TerminalPalette = { ...(variant.terminal ?? {}) };
  terminal.background = toHex(tokenValue("terminal-background"));
  terminal.foreground = toHex(tokenValue("terminal-foreground"));
  terminal.cursor = toHex(tokenValue("terminal-cursor"));
  terminal.cursorAccent = toHex(tokenValue("terminal-cursor-accent"));
  terminal.selection = toHex(tokenValue("terminal-selection"));
  terminal.ansi = ANSI_NAMES.map((n) => toHex(tokenValue(`terminal-ansi-${n}`))) as unknown as TerminalPalette["ansi"];
  variant.terminal = terminal;
  variant.editor = {
    ...(variant.editor ?? {}),
    background: toHex(tokenValue("editor-background")),
    foreground: toHex(tokenValue("editor-foreground")),
  };
  return JSON.stringify(theme, null, 2);
}

function dump(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of TOKENS) out[t] = toHex(tokenValue(t));
  for (const c of ["added", "modified", "deleted", "renamed", "untracked"] as const) {
    const code: GitStatusCode = { added: "A", modified: "M", deleted: "D", renamed: "R", untracked: "U" }[c] as GitStatusCode;
    const v = gitStatusHexColor(code, state.scheme, state.mode);
    if (v) out[`git-${c}`] = toHex(v);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-surface]")) {
    const key = el.dataset.surface!;
    if (key === "hibernated-chip-veil" || key === "hibernated-wash") {
      out[key] = toHex(getComputedStyle(el).backgroundColor);
    }
  }
  return out;
}

function set(patchState: Partial<typeof state>): void {
  Object.assign(state, patchState);
  if (patchState.themeId !== undefined || patchState.mode !== undefined) {
    state.tune = loadTune(tuneKey());
    state.tokens = loadTokens(tuneKey());
  }
  const q = new URLSearchParams({ theme: state.themeId, mode: state.mode, scheme: state.scheme, view: state.view, terminal: state.terminal, editor: state.editor });
  history.replaceState(null, "", `?${q}`);
  render();
}

const root = document.getElementById("preview-root")!;
const style = document.createElement("style");
style.textContent = "html,body{overflow:auto!important;height:auto!important}";
document.head.append(style);

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "ArrowLeft") cycleTheme(-1);
  else if (event.key === "ArrowRight") cycleTheme(1);
  else if (event.key === "ArrowUp") set({ mode: "light" });
  else if (event.key === "ArrowDown") set({ mode: "dark" });
  else return;
  event.preventDefault();
});

function render(): void {
  const theme = currentTheme();
  paint();

  const tokenGrid = h("div", { class: "grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3" });
  for (const t of TOKENS) tokenGrid.append(swatch(t, `var(--${t})`));

  const buttons = h(
    "div",
    { class: "flex flex-wrap items-center gap-2 text-[12px]" },
    h("button", { class: "rounded bg-primary px-3 py-1 text-primary-foreground" }, "Primary"),
    h("button", { class: "rounded bg-secondary px-3 py-1 text-secondary-foreground" }, "Secondary"),
    h("button", { class: "rounded bg-accent px-3 py-1 text-accent-foreground" }, "Accent"),
    h("button", { class: "rounded bg-destructive px-3 py-1 text-white" }, "Destructive"),
    h("span", { class: "rounded-full bg-muted px-2 py-0.5 text-muted-foreground" }, "badge"),
    h("span", { class: "rounded-full border border-border px-2 py-0.5" }, "outline"),
  );

  root.replaceChildren(
    h(
      "main",
      { class: "min-h-screen bg-background p-4 text-foreground" },
      h("h1", { class: "mb-3 text-[15px] font-semibold" }, `${theme.name} / ${state.mode}`),
      themeBar(),
      controls(),
      tunerPanel(),
      ...(state.view === "app"
        ? [section("App (approximation of the real layout)", appView())]
        : [section("Buttons and badges", buttons)]),
      section("Tokens (declared value read back as hex)", tokenGrid),
    ),
  );
}

declare global {
  interface Window {
    kexThemePreview: { dump: typeof dump; set: typeof set; markdown: typeof markdownViews };
  }
}
window.kexThemePreview = { dump, set, markdown: markdownViews };
render();
