import "../styles/globals.css";

import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { applyTheme } from "@/modules/theme/applyTheme";
import { listBuiltinThemes } from "@/modules/theme/themes";
import { validateTheme } from "@/modules/theme/validateTheme";
import { EDITOR_THEME_EXT } from "@/modules/editor/lib/themes";
import { isEditorThemeId } from "@/modules/settings/store";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import type { GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import type { Theme, ThemeMode } from "@/modules/theme/types";

type Scheme = "vscode" | "jetbrains";

const params = new URLSearchParams(location.search);
const state = {
  themeId: params.get("theme") ?? "kex-default",
  mode: (params.get("mode") === "light" ? "light" : "dark") as ThemeMode,
  scheme: (params.get("scheme") === "jetbrains" ? "jetbrains" : "vscode") as Scheme,
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
  "sidebar-ring", "tab-focus-indicator", "terminal-background",
  "terminal-foreground", "terminal-cursor", "terminal-cursor-accent",
  "terminal-selection", ...ANSI_NAMES.map((n) => `terminal-ansi-${n}`),
];

const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

// Any CSS color (oklch, rgba, hex...) to "#rrggbb" or "#rrggbbaa", read back
// from a real pixel so the text never depends on how the browser serializes it.
function toHex(css: string): string {
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

function workspaceBar(): HTMLElement {
  const item = (label: string, active: boolean) =>
    h(
      "div",
      {
        class: active
          ? "flex h-9 items-center justify-center rounded-lg bg-primary text-[12px] text-primary-foreground"
          : "flex h-9 items-center justify-center rounded-lg bg-muted/40 text-[12px] text-muted-foreground",
      },
      label,
    );
  return panel(
    "WorkspaceBar",
    "flex w-[110px] flex-col gap-1.5 border-border/60 bg-card/60",
    item("kex", true), item("hub", false), item("wt", false),
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
    h("div", { class: "rounded bg-sidebar-accent px-1.5 py-0.5 text-[11px] text-sidebar-accent-foreground" }, "Selected note"),
    h("div", { class: "px-1.5 py-0.5 text-[11px]" }, "Other note"),
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
    tab("working", "bg-muted/40", "ml-0.5 size-[8px] animate-spin rounded-full border border-transparent border-t-foreground/70"),
    tab("attention", "bg-muted/40", "ml-0.5 inline-block size-[6px] rounded-full bg-amber-400"),
    tab("restore error", "bg-muted/40 text-destructive/70", "ml-0.5 inline-block size-[6px] rounded-full bg-destructive"),
    gitTab,
  );
}

function terminal(): HTMLElement {
  const v = (n: string) => `var(--terminal-${n})`;
  const line = (...kids: (Node | string)[]) => h("div", { class: "whitespace-pre" }, ...kids);
  const colors = (from: number) =>
    ANSI_NAMES.slice(from, from + 8).map((n) =>
      h("span", { style: `background:${v(`ansi-${n}`)};color:${v("background")}`, class: "px-1", "data-ansi": n }, n.replace("bright-", "b-").slice(0, 5)),
    );
  return h(
    "div",
    { class: "rounded-md border border-border p-2 font-mono text-[12px]", style: `background:${v("background")};color:${v("foreground")}` },
    h("div", { class: "mb-1 font-sans text-[10px] uppercase tracking-wide opacity-60" }, "Terminal"),
    line("$ ls -la  ", h("span", { style: `background:${v("selection")}` }, "selected text"), "  ", h("span", { style: `background:${v("cursor")};color:${v("cursor-accent")}` }, " ")),
    line(...colors(0)),
    line(...colors(8)),
  );
}

async function editor(): Promise<HTMLElement> {
  const theme = currentTheme();
  const pair = theme.editorTheme?.[state.mode] ?? theme.editorTheme?.dark;
  const id = isEditorThemeId(pair) ? pair : state.mode === "light" ? "github-light" : "atomone";
  const host = h("div", { class: "overflow-hidden rounded-md border border-border" });
  new EditorView({
    parent: host,
    state: EditorState.create({
      doc: "export function greet(name: string) {\n  // active line + gutter\n  return `hello ${name}`;\n}\n",
      extensions: [lineNumbers(), highlightActiveLine(), javascript({ typescript: true }), EDITOR_THEME_EXT[id]],
      selection: { anchor: 16, head: 21 },
    }),
  });
  return h("div", {}, h("div", { class: "mb-1 text-[10px] uppercase tracking-wide text-muted-foreground" }, `Editor (CodeMirror theme: ${id})`), host);
}

function controls(): HTMLElement {
  const themes = [...listBuiltinThemes(), ...(state.custom ? [state.custom] : [])];
  const select = h("select", { class: "rounded border border-border bg-transparent px-2 py-1 text-[12px]" });
  for (const t of themes) {
    const o = h("option", { value: t.id }, t.name);
    if (t.id === state.themeId) o.selected = true;
    select.append(o);
  }
  select.onchange = () => set({ themeId: select.value });
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
      btn("dark", state.mode === "dark", () => set({ mode: "dark" })),
      btn("light", state.mode === "light", () => set({ mode: "light" })),
      btn("vscode", state.scheme === "vscode", () => set({ scheme: "vscode" })),
      btn("jetbrains", state.scheme === "jetbrains", () => set({ scheme: "jetbrains" })),
    ),
    area, load, err,
  );
}

function currentTheme(): Theme {
  const all = [...listBuiltinThemes(), ...(state.custom ? [state.custom] : [])];
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
  return out;
}

function set(patch: Partial<typeof state>): void {
  Object.assign(state, patch);
  const q = new URLSearchParams({ theme: state.themeId, mode: state.mode, scheme: state.scheme });
  history.replaceState(null, "", `?${q}`);
  void render();
}

const root = document.getElementById("preview-root")!;
const style = document.createElement("style");
style.textContent = "html,body{overflow:auto!important;height:auto!important}";
document.head.append(style);

async function render(): Promise<void> {
  const theme = currentTheme();
  document.documentElement.classList.toggle("dark", state.mode === "dark");
  document.documentElement.classList.toggle("light", state.mode === "light");
  applyTheme(theme, state.mode);
  document.documentElement.dataset.previewTheme = theme.id;
  document.documentElement.dataset.previewMode = state.mode;

  const tokenGrid = h("div", { class: "grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3" });
  for (const t of TOKENS) tokenGrid.append(swatch(t, `var(--${t})`));

  const surfaces = h(
    "div",
    { class: "flex flex-wrap items-start gap-3" },
    workspaceBar(), sidebar(),
    h("div", { class: "flex min-w-[380px] flex-1 flex-col gap-3" }, header(), tabBar(), terminal(), await editor()),
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
      section("Surfaces", surfaces),
      section("Buttons and badges", buttons),
      section("Tokens (declared value read back as hex)", tokenGrid),
    ),
  );
}

declare global {
  interface Window {
    kexThemePreview: { dump: typeof dump; set: typeof set };
  }
}
window.kexThemePreview = { dump, set };
void render();
