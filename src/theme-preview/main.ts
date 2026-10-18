import "../styles/globals.css";

import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
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
import type { Theme, ThemeMode } from "@/modules/theme/types";

type Scheme = "vscode" | "jetbrains";

const params = new URLSearchParams(location.search);
const state = {
  themeId: params.get("theme") ?? "kex-default",
  mode: (params.get("mode") === "light" ? "light" : "dark") as ThemeMode,
  scheme: (params.get("scheme") === "jetbrains" ? "jetbrains" : "vscode") as Scheme,
  view: (["app", "markdown"].includes(params.get("view") ?? "") ? params.get("view") : "swatches") as
    | "app"
    | "swatches"
    | "markdown",
  terminal: params.get("terminal") ?? TERMINAL_THEME_AUTO,
  // An explicit editor theme, like the Settings choice; "auto" is the app theme's own pairing.
  editor: params.get("editor") ?? "auto",
  custom: null as Theme | null,
};

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

const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

// Any CSS color (oklch, rgba, hex...) to "#rrggbb" or "#rrggbbaa", read back
// from a real pixel so the text never depends on how the browser serializes it.
function toHex(css: string): string {
  const ref = /^var\(--([\w-]+)\)$/.exec(css);
  if (ref) css = tokenValue(ref[1]);
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}${a === 255 ? "" : h(a)}`;
}

function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
}

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

// A color sample whose exact value is printed next to it and mirrored in
// data-* attributes, so it can be checked without trusting a screenshot.
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

function tag(text: string, css: string, extra = ""): HTMLElement {
  const hex = toHex(css);
  return h("span", { class: extra, style: `color:${css}`, "data-hex": hex }, text);
}

const FILES: { name: string; code: GitStatusCode | "" }[] = [
  { name: "no_changes.html", code: "" },
  { name: "file_modified.ts", code: "M" },
  { name: "new_file.rs", code: "A" },
  { name: "untracked.java", code: "U" },
  { name: "deleted.md", code: "D" },
  { name: "renamed.tsx", code: "R" },
];

function gitRows(): HTMLElement {
  const box = h("div", { class: "flex flex-col gap-px" });
  for (const f of FILES) {
    const color = f.code ? gitStatusHexColor(f.code, state.scheme, state.mode) : null;
    const row = h(
      "div",
      { class: "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px]", "data-file": f.name, "data-hex": color ? toHex(color) : "" },
      h("span", { style: color ? `color:${color}` : "", class: f.code === "D" ? "line-through" : "" }, f.name),
      h("span", { class: "ml-auto text-[10px] font-semibold", style: color ? `color:${color}` : "" }, f.code),
      h("span", { class: "font-mono text-[10px] text-muted-foreground" }, color ? toHex(color) : "-"),
    );
    box.append(row);
  }
  return box;
}

function panel(title: string, cls: string, ...kids: Node[]): HTMLElement {
  return h(
    "div",
    { class: `rounded-md border p-2 ${cls}` },
    h("div", { class: "mb-1.5 text-[10px] uppercase tracking-wide opacity-60" }, title),
    ...kids,
  );
}

// Copies the hibernated chip of WorkspaceBar.tsx: the normal inactive chip with
// the static `ws-hib-look` veil on top.
function hibernatedItem(label: string): HTMLElement {
  return h(
    "div",
    {
      class: "relative flex h-9 items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.09] text-[13px] text-muted-foreground",
      "data-surface": "hibernated-chip",
    },
    h("span", { class: "ws-hib-look", "data-surface": "hibernated-chip-veil" }),
    label,
  );
}

// Copies HibernatedOverlay.tsx at rest: the .hib-wash tint only exists during
// the entrance animation, so it is drawn here as a strip to show its color.
function hibernatedOverlay(): HTMLElement {
  return h(
    "div",
    {
      class: "relative flex h-[300px] flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-md border border-border bg-background text-muted-foreground",
      "data-surface": "hibernated-overlay",
    },
    h("div", { class: "size-16 rounded-full border border-current opacity-70" }),
    h("span", { class: "text-[15px] text-foreground" }, "kex"),
    h("span", { class: "text-[12px]" }, "Hibernated for 2h"),
    h("span", { class: "rounded-md bg-primary px-4 py-1.5 text-[13px] text-primary-foreground" }, "Restore"),
    h("span", { class: "hib-wash", style: "inset:auto 0 0 0;height:18px", "data-surface": "hibernated-wash" }),
  );
}

function workspaceBar(): HTMLElement {
  const item = (label: string, active: boolean) =>
    h(
      "div",
      {
        class: active
          ? "flex h-9 items-center justify-center rounded-lg bg-primary text-[13px] text-primary-foreground"
          : "flex h-9 items-center justify-center rounded-lg bg-foreground/[0.09] text-[13px] text-muted-foreground",
      },
      label,
    );
  return panel(
    "WorkspaceBar",
    "flex w-[110px] flex-col gap-1.5 border-border/60 bg-card/60",
    item("kex", true), item("hub", false), item("wt", false), hibernatedItem("old"),
    h("span", { class: "h-px w-full bg-border/40" }),
    h("span", { class: "text-[11px] font-medium text-muted-foreground/60" }, "Group"),
  );
}

function header(): HTMLElement {
  return panel(
    "Header",
    "flex items-center gap-2 border-border bg-background text-foreground",
    h("span", { class: "text-[12px] font-medium" }, "kex / main"),
    h("span", { class: "text-[12px] text-muted-foreground" }, "Terminal 1"),
    h("span", { class: "ml-auto rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground" }, "Run"),
  );
}

function sidebar(): HTMLElement {
  const commit = (msg: string, color: string) =>
    h(
      "div",
      { class: "flex items-center gap-2 text-[11px]" },
      h("span", { class: "size-2 rounded-full", style: `background:${color}` }),
      h("span", {}, msg),
    );
  const scm = h("div", { class: "flex flex-col gap-0.5" });
  for (const f of FILES) {
    if (!f.code) continue;
    const c = gitStatusHexColor(f.code, state.scheme, state.mode);
    scm.append(
      h(
        "div",
        { class: "flex items-center gap-1.5 rounded bg-sidebar-accent/50 px-1.5 py-0.5 text-[11px] text-sidebar-accent-foreground" },
        h("span", {}, f.name),
        h("span", { class: "ml-auto font-semibold", style: c ? `color:${c}` : "" }, f.code),
      ),
    );
  }
  return panel(
    "Sidebar",
    "w-[300px] border-sidebar-border bg-sidebar text-sidebar-foreground",
    h(
      "div",
      { class: "mb-2 flex gap-1 text-[11px]" },
      h("span", { class: "rounded bg-sidebar-primary px-2 py-0.5 text-sidebar-primary-foreground" }, "Explorer"),
      h("span", { class: "rounded px-2 py-0.5 opacity-70" }, "Git"),
      h("span", { class: "rounded px-2 py-0.5 opacity-70" }, "History"),
      h("span", { class: "rounded px-2 py-0.5 opacity-70" }, "Notes"),
    ),
    h("div", { class: "mb-1 text-[10px] opacity-60" }, `Explorer (${state.scheme})`),
    gitRows(),
    h("div", { class: "mb-1 mt-2 text-[10px] opacity-60" }, "Source Control"),
    scm,
    h("div", { class: "mb-1 mt-2 text-[10px] opacity-60" }, "Git History"),
    commit("Fix restore shell ready", "#7aa2f7"),
    commit("Use saturated git colors", "#bb9af7"),
    commit("Darken foreground", "#9ece6a"),
    h("div", { class: "mb-1 mt-2 text-[10px] opacity-60" }, "Notes"),
    ...(["editor", "terminal"] as const).map((kind) =>
      h(
        "div",
        {
          class: "mb-1 rounded-lg border border-border px-2 py-1.5 text-[11px] shadow-xl",
          style: `background:var(--note-${kind}-background);color:var(--note-${kind}-foreground)`,
          "data-surface": `note-${kind}`,
        },
        h("div", { class: "font-semibold" }, `Floating note over ${kind}`),
        h("div", {}, "Remember to rebase before the release."),
      ),
    ),
  );
}

function tabBar(): HTMLElement {
  const tab = (label: string, cls: string, dot = "") =>
    h(
      "div",
      { class: `flex items-center gap-1.5 rounded px-2 py-1 text-[12px] ${cls}` },
      h("span", {}, label),
      dot ? h("span", { class: dot }) : "",
    );
  const active = tab("active", "bg-background text-foreground ring-1 ring-tab-focus-indicator");
  const gitTab = tab("modified.ts", "bg-muted/40");
  const gitHex = gitStatusHexColor("M", state.scheme, state.mode);
  if (gitHex) (gitTab.firstElementChild as HTMLElement).style.color = gitHex;
  return panel(
    "Tab bar",
    "flex flex-wrap items-center gap-1 border-border bg-card text-muted-foreground",
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
    style: focused
      ? `background:${v("cursor")};color:${v("cursor-accent")}`
      : `outline:1px solid ${v("cursor")};outline-offset:-1px`,
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

// Mirrors PaneView: an unfocused pane gets a black overlay at the theme's
// inactivePaneDim[kind] opacity over its tab strip and content; the focused
// pane's active tab gets the tab-focus-indicator bar.
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
    {
      class: "min-w-[370px] flex-1 overflow-hidden rounded-md border border-border",
      "data-pane": kind, "data-focused": String(focused), "data-dim": String(dim),
    },
    strip, body,
    h("div", { class: "border-t border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground" }, `${kind} ${focused ? "focused" : "unfocused"}, dim ${dim}`),
  );
}

function appFrame(focus: PaneKind): HTMLElement {
  return h(
    "div",
    { class: "flex min-h-[520px] overflow-hidden rounded-lg border border-border bg-background", "data-view": "app", "data-focus": focus },
    workspaceBar(),
    h("div", { class: "max-h-[520px] overflow-auto" }, sidebar()),
    h(
      "div",
      { class: "flex min-w-0 flex-1 flex-col gap-2 p-2" },
      header(),
      h("div", { class: "flex min-h-0 flex-1 flex-wrap gap-2" }, pane("terminal", focus === "terminal"), pane("editor", focus === "editor")),
      h("div", { class: "flex items-center gap-3 rounded bg-card px-2 py-1 text-[11px] text-muted-foreground" }, h("span", {}, "main"), h("span", {}, "2 changed")),
    ),
  );
}

// Both focus states at once, so nothing needs to be clicked to see them.
function appView(): HTMLElement {
  const titled = (title: string, frame: HTMLElement) =>
    h("div", { class: "mb-4" }, h("div", { class: "mb-1 text-[11px] text-muted-foreground" }, title), frame);
  return h(
    "div",
    {},
    titled("Terminal pane focused, editor pane unfocused", appFrame("terminal")),
    titled("Editor pane focused, terminal pane unfocused", appFrame("editor")),
    titled(
      "Hibernated workspace: overlay and chip",
      h("div", { class: "flex gap-2 rounded-lg border border-border bg-background p-2", "data-view": "hibernated" }, workspaceBar(), hibernatedOverlay()),
    ),
  );
}

function controls(): HTMLElement {
  const themes = [...listBuiltinThemes(), ...(state.custom ? [state.custom] : [])];
  const select = h("select", { class: "rounded border border-border bg-transparent px-2 py-1 text-[12px]" });
  for (const t of themes) {
    for (const mode of ["dark", "light"] as const) {
      if (!t.variants[mode]) continue;
      const o = h("option", { value: `${t.id}|${mode}` }, `${t.name} ${mode}`);
      if (t.id === state.themeId && mode === state.mode) o.selected = true;
      select.append(o);
    }
  }
  select.onchange = () => {
    const [themeId, mode] = select.value.split("|");
    set({ themeId, mode: mode as ThemeMode });
  };
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
      select,
      terminalSelect,
      editorSelect,
      btn("vscode", state.scheme === "vscode", () => set({ scheme: "vscode" })),
      btn("jetbrains", state.scheme === "jetbrains", () => set({ scheme: "jetbrains" })),
      btn("swatches view", state.view === "swatches", () => set({ view: "swatches" })),
      btn("app view", state.view === "app", () => set({ view: "app" })),
      btn("markdown view", state.view === "markdown", () => set({ view: "markdown" })),
    ),
    area, load, err,
  );
}

// Rich (the Live Preview editor, cursor on the last line so nothing else shows raw) next
// to Preview (the read-only view), same document, same theme. Both documents have the
// same number of lines, so line n of one is line n of the other.
const markdownViews: { rich?: EditorView; preview?: EditorView } = {};

function markdownView(): HTMLElement {
  const id = activeEditorId(currentTheme());
  const identity = (src: string) => src;
  const pane = (label: string, doc: string, extensions: Extension[]) => {
    const host = h("div", { class: "h-[78vh] overflow-auto rounded-md border border-border/60", style: "background:var(--editor-background);color:var(--editor-foreground)" });
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc, extensions: [EDITOR_THEME_EXT[id], ...extensions], selection: { anchor: doc.length } }),
    });
    return { view, node: h("div", { class: "flex min-w-0 flex-col gap-1" }, h("div", { class: "text-[11px] text-muted-foreground" }, label), host) };
  };
  const rich = pane("Rich", markdownDemo, buildLivePreviewExtensions(identity));
  const preview = pane("Preview", markdownDemo, buildStaticPreviewExtensions(identity));
  markdownViews.rich = rich.view;
  markdownViews.preview = preview.view;
  return h("div", { class: "grid grid-cols-1 gap-3 xl:grid-cols-2", "data-editor-theme": id }, rich.node, preview.node);
}

function allThemes(): Theme[] {
  return [...listBuiltinThemes(), ...(state.custom ? [state.custom] : [])];
}

function currentTheme(): Theme {
  const all = allThemes();
  return all.find((t) => t.id === state.themeId) ?? all[0];
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

function set(patch: Partial<typeof state>): void {
  Object.assign(state, patch);
  const q = new URLSearchParams({ theme: state.themeId, mode: state.mode, scheme: state.scheme, view: state.view, terminal: state.terminal, editor: state.editor });
  history.replaceState(null, "", `?${q}`);
  render();
}

const root = document.getElementById("preview-root")!;
const style = document.createElement("style");
style.textContent = "html,body{overflow:auto!important;height:auto!important}";
document.head.append(style);

function render(): void {
  const theme = currentTheme();
  document.documentElement.classList.toggle("dark", state.mode === "dark");
  document.documentElement.classList.toggle("light", state.mode === "light");
  applyTheme(
    theme,
    state.mode,
    resolveTerminalPalette(state.terminal, theme, [...allThemes(), ...listTerminalOnlyThemes()], state.mode),
    isEditorThemeId(state.editor) ? readEditorThemeSurface(state.editor) : undefined,
  );
  document.documentElement.dataset.previewTheme = theme.id;
  document.documentElement.dataset.previewTerminal = state.terminal;
  document.documentElement.dataset.previewMode = state.mode;

  const tokenGrid = h("div", { class: "grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3" });
  for (const t of TOKENS) tokenGrid.append(swatch(t, `var(--${t})`));

  const surfaces = h(
    "div",
    { class: "flex flex-wrap items-start gap-3" },
    workspaceBar(), sidebar(), hibernatedOverlay(),
    h(
      "div",
      { class: "flex min-w-[380px] flex-1 flex-col gap-3" },
      header(), tabBar(),
      h("div", { class: "grid grid-cols-[repeat(auto-fit,minmax(370px,1fr))] gap-3" }, pane("terminal", true), pane("terminal", false), pane("editor", true), pane("editor", false)),
    ),
  );
  const buttons = h(
    "div",
    { class: "flex flex-wrap items-center gap-2 text-[12px]" },
    h("button", { class: "rounded bg-primary px-3 py-1 text-primary-foreground" }, "Primary"),
    h("button", { class: "rounded bg-secondary px-3 py-1 text-secondary-foreground" }, "Secondary"),
    h("button", { class: "rounded bg-accent px-3 py-1 text-accent-foreground" }, "Accent"),
    h("button", { class: "rounded bg-destructive px-3 py-1 text-white" }, "Destructive"),
    h("span", { class: "rounded-full bg-muted px-2 py-0.5 text-muted-foreground" }, "badge"),
    h("span", { class: "rounded-full border border-border px-2 py-0.5" }, "outline"),
    tag("destructive text", "var(--destructive)"),
  );

  root.replaceChildren(
    h(
      "main",
      { class: "min-h-screen bg-background p-4 text-foreground" },
      h("h1", { class: "mb-3 text-[15px] font-semibold" }, `${theme.name} / ${state.mode}`),
      controls(),
      ...(state.view === "app"
        ? [section("App (approximation of the real layout)", appView())]
        : state.view === "markdown"
          ? [section("Markdown: Rich and Preview", markdownView())]
          : [section("Surfaces", surfaces), section("Buttons and badges", buttons)]),
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
