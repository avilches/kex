import type { KeyBinding, ShortcutId } from "@/modules/shortcuts/shortcuts";
import {
  type EditorViewMap,
  type EditorViewSettings,
  CODE_DEFAULTS,
  PROSE_DEFAULTS,
} from "@/modules/editor/lib/editorViewSettings";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { CustomEditor } from "@/modules/external-editors/types";
import type { DetectedEditor } from "@/modules/external-editors/types";

export type ThemePref = "system" | "light" | "dark";

export type TabBarStyle = "connected" | "pill";

export type GitColorScheme = "vscode" | "jetbrains";

export type ScmViewMode = "list" | "tree";

export type TerminalNewFolderMode = "home" | "workspace" | "context";

export type DiffViewMode = "unified" | "split";

export type TextEditorMode = "file-only" | "workspace-and-files";

export type CursorStyle = "bar" | "block" | "underline";

export type CursorInactiveStyle =
  | "outline"
  | "block"
  | "bar"
  | "underline"
  | "none";

export const DEFAULT_THEME_ID = "kex-default";

export const EDITOR_THEMES = [
  "kanagawa",
  "kanagawa-lotus",
  "kanagawa-dragon",
  "tokyo-night",
  "catppuccin-mocha",
  "catppuccin-latte",
  "rose-pine",
  "rose-pine-dawn",
  "everforest",
  "everforest-light",
  "dracula",
  "solarized-dark",
  "solarized-light",
  "nord",
  "gruvbox-dark",
  "atomone",
  "aura",
  "copilot",
  "github-dark",
  "github-light",
  "xcode-dark",
  "xcode-light",
] as const;

export type EditorThemeId = (typeof EDITOR_THEMES)[number];

/** "auto" follows the active app theme's editorTheme pairing (resolved live). */
export const EDITOR_THEME_AUTO = "auto" as const;
export type EditorThemePref = typeof EDITOR_THEME_AUTO | EditorThemeId;

export function isEditorThemeId(v: unknown): v is EditorThemeId {
  return (
    typeof v === "string" && (EDITOR_THEMES as readonly string[]).includes(v)
  );
}

export const EDITOR_THEME_MODE: Record<EditorThemeId, "light" | "dark"> = {
  kanagawa: "dark",
  "kanagawa-lotus": "light",
  "kanagawa-dragon": "dark",
  "tokyo-night": "dark",
  "catppuccin-mocha": "dark",
  "catppuccin-latte": "light",
  "rose-pine": "dark",
  "rose-pine-dawn": "light",
  everforest: "dark",
  "everforest-light": "light",
  dracula: "dark",
  "solarized-dark": "dark",
  "solarized-light": "light",
  nord: "dark",
  "gruvbox-dark": "dark",
  atomone: "dark",
  aura: "dark",
  copilot: "dark",
  "github-dark": "dark",
  "github-light": "light",
  "xcode-dark": "dark",
  "xcode-light": "light",
};

export const EDITOR_THEME_LABELS: Record<EditorThemeId, string> = {
  kanagawa: "Kanagawa Wave",
  "kanagawa-lotus": "Kanagawa Lotus",
  "kanagawa-dragon": "Kanagawa Dragon",
  "tokyo-night": "Tokyo Night",
  "catppuccin-mocha": "Catppuccin Mocha",
  "catppuccin-latte": "Catppuccin Latte",
  "rose-pine": "Rosé Pine",
  "rose-pine-dawn": "Rosé Pine Dawn",
  everforest: "Everforest Dark",
  "everforest-light": "Everforest Light",
  dracula: "Dracula",
  "solarized-dark": "Solarized Dark",
  "solarized-light": "Solarized Light",
  nord: "Nord",
  "gruvbox-dark": "Gruvbox Dark",
  atomone: "Atom One",
  aura: "Aura",
  copilot: "Copilot",
  "github-dark": "GitHub Dark",
  "github-light": "GitHub Light",
  "xcode-dark": "Xcode Dark",
  "xcode-light": "Xcode Light",
};

export type PaneSplitLimit = { width: number; height: number };

export type Preferences = {
  theme: ThemePref;
  themeId: string;
  editorTheme: EditorThemePref;
  editorFontFamily: string;
  editorFontSize: number;
  editorLetterSpacing: number;
  editorLineHeight: number;
  autostart: boolean;
  autofocusNewTabs: boolean;
  explorerGitColorScheme: GitColorScheme;
  scmViewMode: ScmViewMode;
  terminalWebglEnabled: boolean;
  terminalCursorBlink: boolean;
  editorCursorBlink: boolean;
  editorCursorBlinkRate: number;
  editorCursorStyle: CursorStyle;
  warnOnCloseTabWithRunningProcess: boolean;
  warnOnCloseWorkspace: boolean;
  terminalFontFamily: string;
  terminalShell: string;
  terminalFontWeight: string;
  terminalLetterSpacing: number;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalScrollback: number;
  terminalCursorStyle: CursorStyle;
  terminalCursorInactiveStyle: CursorInactiveStyle;
  terminalCursorWidth: number;
  terminalScrollSensitivity: number;
  terminalNewFolderMode: TerminalNewFolderMode;
  lastWslDistro: string | null;
  zoomLevel: number;
  agentNotifications: boolean;
  shortcuts: Record<ShortcutId, KeyBinding[]>;
  editorAutoSave: boolean;
  editorAutoSaveDelay: number; // JSON-only: no settings UI, edit settings-general.json
  editorPreviewOnClick: boolean;
  editorViewByExt: EditorViewMap;
  editorScrollPastEnd: boolean;
  diffViewMode: DiffViewMode;
  editorHighlightActiveLine: boolean; // JSON-only: no settings UI, edit settings-general.json
  editorBracketMatching: boolean;
  editorCloseBrackets: boolean;
  editorAutocompletion: boolean;
  tabBarStyle: TabBarStyle;
  workspacePaneLimit: number; // JSON-only: no settings UI, edit settings-general.json
  paneSplitLimit: PaneSplitLimit; // JSON-only: no settings UI, edit settings-general.json
  keepFolderLayoutOnChangeExplorerRoot: boolean; // JSON-only: no settings UI, edit settings-general.json
  scratchpadEnterSends: boolean;
  scratchpadInNewTerminals: boolean;
  textEditorMode: TextEditorMode;
  preferredFileEditorId: string | null;
  preferredWorkspaceEditorId: string | null;
  customEditors: CustomEditor[];
  detectedEditors: DetectedEditor[];
  disabledDetectedEditorIds: string[];
};

const STORE_PATH = "settings-general.json";
const SHORTCUTS_STORE_PATH = "settings-shortcuts.json";
const TOOLS_STORE_PATH = "settings-tools.json";
const KEY_THEME = "theme";
const KEY_THEME_ID = "themeId";
const KEY_EDITOR_THEME = "editorTheme";
const KEY_EDITOR_FONT_FAMILY = "editorFontFamily";
const KEY_EDITOR_FONT_SIZE = "editorFontSize";
const KEY_EDITOR_LETTER_SPACING = "editorLetterSpacing";
const KEY_EDITOR_LINE_HEIGHT = "editorLineHeight";
const KEY_AUTOSTART = "autostart";
const KEY_AUTOFOCUS_NEW_TABS = "autofocusNewTabs";
const KEY_EXPLORER_GIT_COLOR_SCHEME = "explorerGitColorScheme";
const KEY_SCM_VIEW_MODE = "scmViewMode";
const KEY_TERMINAL_WEBGL_ENABLED = "terminalWebglEnabled";
const KEY_TERMINAL_CURSOR_BLINK = "terminalCursorBlink";
const KEY_EDITOR_CURSOR_BLINK = "editorCursorBlink";
const KEY_EDITOR_CURSOR_BLINK_RATE = "editorCursorBlinkRate";
const KEY_EDITOR_CURSOR_STYLE = "editorCursorStyle";
const KEY_WARN_ON_CLOSE_RUNNING = "warnOnCloseTabWithRunningProcess";
const KEY_WARN_ON_CLOSE_WORKSPACE = "warnOnCloseWorkspace";
const KEY_TERMINAL_FONT_FAMILY = "terminalFontFamily";
const KEY_TERMINAL_SHELL = "terminalShell";
const KEY_TERMINAL_FONT_WEIGHT = "terminalFontWeight";
const KEY_TERMINAL_LETTER_SPACING = "terminalLetterSpacing";
const KEY_TERMINAL_FONT_SIZE = "terminalFontSize";
const KEY_TERMINAL_LINE_HEIGHT = "terminalLineHeight";
const KEY_TERMINAL_SCROLLBACK = "terminalScrollback";
const KEY_TERMINAL_CURSOR_STYLE = "terminalCursorStyle";
const KEY_TERMINAL_CURSOR_INACTIVE_STYLE = "terminalCursorInactiveStyle";
const KEY_TERMINAL_CURSOR_WIDTH = "terminalCursorWidth";
const KEY_TERMINAL_SCROLL_SENSITIVITY = "terminalScrollSensitivity";
const KEY_LAST_WSL_DISTRO = "lastWslDistro";
const KEY_ZOOM_LEVEL = "zoomLevel";
const KEY_AGENT_NOTIFICATIONS = "agentNotifications";
const KEY_SHORTCUTS = "shortcuts";
const KEY_EDITOR_AUTO_SAVE = "editorAutoSave";
const KEY_EDITOR_AUTO_SAVE_DELAY = "editorAutoSaveDelay";
const KEY_EDITOR_PREVIEW_ON_CLICK = "editorPreviewOnClick";
const KEY_EDITOR_VIEW_BY_EXT = "editorViewByExt";
const KEY_EDITOR_SCROLL_PAST_END = "editorScrollPastEnd";
const KEY_DIFF_VIEW_MODE = "diffViewMode";
const KEY_EDITOR_HIGHLIGHT_ACTIVE_LINE = "editorHighlightActiveLine";
const KEY_EDITOR_BRACKET_MATCHING = "editorBracketMatching";
const KEY_EDITOR_CLOSE_BRACKETS = "editorCloseBrackets";
const KEY_EDITOR_AUTOCOMPLETION = "editorAutocompletion";
const KEY_TAB_BAR_STYLE = "tabBarStyle";
const KEY_WORKSPACE_PANE_LIMIT = "workspacePaneLimit";
const KEY_PANE_SPLIT_LIMIT = "paneSplitLimit";
const KEY_KEEP_FOLDER_LAYOUT = "keepFolderLayoutOnChangeExplorerRoot";
const KEY_TERMINAL_NEW_FOLDER_MODE = "terminalNewFolderMode";
const KEY_SCRATCHPAD_ENTER_SENDS = "scratchpadEnterSends";
const KEY_SCRATCHPAD_IN_NEW_TERMINALS = "scratchpadInNewTerminals";
const KEY_TEXT_EDITOR_MODE = "textEditorMode";
const KEY_PREFERRED_FILE_EDITOR_ID = "preferredFileEditorId";
const KEY_PREFERRED_WORKSPACE_EDITOR_ID = "preferredWorkspaceEditorId";
const KEY_CUSTOM_EDITORS = "customEditors";
const KEY_DETECTED_EDITORS = "detectedEditors";
const KEY_DISABLED_DETECTED_IDS = "disabledDetectedEditorIds";

export const TERMINAL_FONT_SIZE_DEFAULT = 13;
export const TERMINAL_FONT_SIZE_MIN = 8;
export const TERMINAL_FONT_SIZE_MAX = 18;

export const EDITOR_FONT_SIZE_DEFAULT = 12;
export const EDITOR_FONT_SIZE_MIN = 8;
export const EDITOR_FONT_SIZE_MAX = 18;

export const FONT_SIZE_STEP = 0.5;

export const LETTER_SPACING_MIN = -4;
export const LETTER_SPACING_MAX = 4;
export const LETTER_SPACING_STEP = 0.5;
export const LETTER_SPACING_DEFAULT = 0;

export const LINE_HEIGHT_MIN = 0.8;
export const LINE_HEIGHT_MAX = 1.8;
export const LINE_HEIGHT_STEP = 0.1;
export const TERMINAL_LINE_HEIGHT_DEFAULT = 1.2;
export const EDITOR_LINE_HEIGHT_DEFAULT = 1.5;


// Snap to the slider step, clamp to range, and strip float drift (0.30000004).
export function clampToStep(
  value: number,
  min: number,
  max: number,
  step: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  const snapped = Math.round(value / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  return Math.round(clamped * 100) / 100;
}

export const TERMINAL_SCROLLBACK_DEFAULT = 2000;
export const TERMINAL_SCROLLBACK_MIN = 200;
export const TERMINAL_SCROLLBACK_MAX = 50_000;
export const TERMINAL_SCROLLBACK_PRESETS = [
  500, 1000, 2000, 5000, 10_000, 25_000,
] as const;

export const CURSOR_STYLES = ["bar", "block", "underline"] as const;
export const CURSOR_STYLE_DEFAULT: CursorStyle = "bar";

export const CURSOR_INACTIVE_STYLES = [
  "outline",
  "block",
  "bar",
  "underline",
  "none",
] as const;
export const CURSOR_INACTIVE_STYLE_DEFAULT: CursorInactiveStyle = "outline";

// xterm only honors cursorWidth for the bar cursor; it is CSS px.
export const CURSOR_WIDTH_MIN = 1;
export const CURSOR_WIDTH_MAX = 4;
export const CURSOR_WIDTH_STEP = 1;
export const CURSOR_WIDTH_DEFAULT = 1;

// Multiplier applied to wheel deltas; 1 is xterm's default feel.
export const SCROLL_SENSITIVITY_MIN = 1;
export const SCROLL_SENSITIVITY_MAX = 5;
export const SCROLL_SENSITIVITY_STEP = 1;
export const SCROLL_SENSITIVITY_DEFAULT = 1;

// Editor caret blink period, in ms. Lower is faster. Only used when blink is on.
export const EDITOR_BLINK_RATE_MIN = 200;
export const EDITOR_BLINK_RATE_MAX = 2000;
export const EDITOR_BLINK_RATE_STEP = 100;
export const EDITOR_BLINK_RATE_DEFAULT = 1200;

export function parseCursorStyle(value: unknown): CursorStyle {
  return typeof value === "string" &&
    (CURSOR_STYLES as readonly string[]).includes(value)
    ? (value as CursorStyle)
    : CURSOR_STYLE_DEFAULT;
}

export function parseCursorInactiveStyle(value: unknown): CursorInactiveStyle {
  return typeof value === "string" &&
    (CURSOR_INACTIVE_STYLES as readonly string[]).includes(value)
    ? (value as CursorInactiveStyle)
    : CURSOR_INACTIVE_STYLE_DEFAULT;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  themeId: DEFAULT_THEME_ID,
  editorTheme: EDITOR_THEME_AUTO,
  editorFontFamily: "",
  editorFontSize: EDITOR_FONT_SIZE_DEFAULT,
  editorLetterSpacing: LETTER_SPACING_DEFAULT,
  editorLineHeight: EDITOR_LINE_HEIGHT_DEFAULT,
  autostart: false,
  autofocusNewTabs: false,
  explorerGitColorScheme: "vscode",
  scmViewMode: "tree",
  terminalWebglEnabled: true,
  terminalCursorBlink: false,
  editorCursorBlink: false,
  editorCursorBlinkRate: EDITOR_BLINK_RATE_DEFAULT,
  editorCursorStyle: "bar",
  warnOnCloseTabWithRunningProcess: true,
  warnOnCloseWorkspace: true,
  terminalFontFamily: "",
  terminalShell: "",
  terminalFontWeight: "normal",
  terminalLetterSpacing: LETTER_SPACING_DEFAULT,
  terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
  terminalLineHeight: TERMINAL_LINE_HEIGHT_DEFAULT,
  terminalScrollback: TERMINAL_SCROLLBACK_DEFAULT,
  terminalCursorStyle: CURSOR_STYLE_DEFAULT,
  terminalCursorInactiveStyle: CURSOR_INACTIVE_STYLE_DEFAULT,
  terminalCursorWidth: CURSOR_WIDTH_DEFAULT,
  terminalScrollSensitivity: SCROLL_SENSITIVITY_DEFAULT,
  terminalNewFolderMode: "context",
  lastWslDistro: null,
  zoomLevel: 1.0,
  agentNotifications: true,
  shortcuts: {} as Record<ShortcutId, KeyBinding[]>,
  editorAutoSave: false,
  editorAutoSaveDelay: 15000,
  editorPreviewOnClick: true,
  editorViewByExt: {},
  editorScrollPastEnd: false,
  diffViewMode: "unified",
  editorHighlightActiveLine: true,
  editorBracketMatching: true,
  editorCloseBrackets: true,
  editorAutocompletion: true,
  tabBarStyle: "connected",
  workspacePaneLimit: 8,
  paneSplitLimit: { width: 250, height: 250 },
  keepFolderLayoutOnChangeExplorerRoot: false,
  scratchpadEnterSends: true,
  scratchpadInNewTerminals: true,
  textEditorMode: "workspace-and-files",
  preferredFileEditorId: null,
  preferredWorkspaceEditorId: null,
  customEditors: [],
  detectedEditors: [],
  disabledDetectedEditorIds: [],
};

const PROSE_SEED_EXTS = ["md", "markdown", "mdx", "txt", "text"] as const;

function buildColdStartMap(): EditorViewMap {
  const m: EditorViewMap = { "*": { ...CODE_DEFAULTS } };
  for (const e of PROSE_SEED_EXTS) m[e] = { ...PROSE_DEFAULTS };
  return m;
}

// Keybindings live in their own file so reassigning a shortcut never rewrites
// the (much larger) general settings, and vice versa.
const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });
const shortcutsStore = new LazyStore(SHORTCUTS_STORE_PATH, { defaults: {}, autoSave: 200 });
const toolsStore = new LazyStore(TOOLS_STORE_PATH, { defaults: {}, autoSave: 200 });

// LazyStore.onChange only fires within the writing process. The settings
// page lives in a separate webview, so writes there never reach the main
// window's subscribers. Mirror every setter through a Tauri event so any
// window can listen.
const PREFS_CHANGED_EVENT = "kex://prefs-changed";

export function parseScmViewMode(value: unknown): ScmViewMode {
  return value === "list" ? "list" : "tree";
}

export function parseTerminalNewFolderMode(value: unknown): TerminalNewFolderMode {
  if (value === "home") return "home";
  if (value === "workspace") return "workspace";
  return "context";
}

export function parseTextEditorMode(value: unknown): TextEditorMode {
  if (value === "file-only") return "file-only";
  return "workspace-and-files";
}

async function writePref<T>(key: string, value: T): Promise<void> {
  await store.set(key, value);
  await store.save();
  await emit(PREFS_CHANGED_EVENT, { key, value });
}

async function writeToolsPref<T>(key: string, value: T): Promise<void> {
  await toolsStore.set(key, value);
  await toolsStore.save();
  await emit(PREFS_CHANGED_EVENT, { key, value });
}

async function writeShortcutsPref(
  value: Record<ShortcutId, KeyBinding[]> | {},
): Promise<void> {
  await shortcutsStore.set(KEY_SHORTCUTS, value);
  await shortcutsStore.save();
  await emit(PREFS_CHANGED_EVENT, { key: KEY_SHORTCUTS, value });
}

export async function loadPreferences(): Promise<Preferences> {
  // Single IPC roundtrip for general settings — fetching keys individually
  // fans out to one `plugin:store|get` per setting and is the dominant boot
  // cost. Shortcuts live in their own file, fetched in parallel.
  const [entries, toolsEntries, shortcutsValue] = await Promise.all([
    store.entries(),
    toolsStore.entries(),
    shortcutsStore.get<Record<ShortcutId, KeyBinding[]>>(KEY_SHORTCUTS),
  ]);
  const map = new Map<string, unknown>([...entries, ...toolsEntries]);
  const get = <T>(k: string): T | undefined => map.get(k) as T | undefined;
  const result: Preferences = {
    theme: get<ThemePref>(KEY_THEME) ?? DEFAULT_PREFERENCES.theme,
    themeId: get<string>(KEY_THEME_ID) ?? DEFAULT_PREFERENCES.themeId,
    editorTheme: ((): EditorThemePref => {
      const stored = get<string>(KEY_EDITOR_THEME);
      if (stored === EDITOR_THEME_AUTO || isEditorThemeId(stored)) return stored;
      return DEFAULT_PREFERENCES.editorTheme;
    })(),
    editorFontFamily:
      get<string>(KEY_EDITOR_FONT_FAMILY) ??
      DEFAULT_PREFERENCES.editorFontFamily,
    editorFontSize:
      get<number>(KEY_EDITOR_FONT_SIZE) ?? DEFAULT_PREFERENCES.editorFontSize,
    editorLetterSpacing:
      get<number>(KEY_EDITOR_LETTER_SPACING) ??
      DEFAULT_PREFERENCES.editorLetterSpacing,
    editorLineHeight:
      get<number>(KEY_EDITOR_LINE_HEIGHT) ??
      DEFAULT_PREFERENCES.editorLineHeight,
    autostart: get<boolean>(KEY_AUTOSTART) ?? DEFAULT_PREFERENCES.autostart,
    autofocusNewTabs:
      get<boolean>(KEY_AUTOFOCUS_NEW_TABS) ??
      DEFAULT_PREFERENCES.autofocusNewTabs,
    explorerGitColorScheme: (() => {
      const v = get<string>(KEY_EXPLORER_GIT_COLOR_SCHEME);
      if (v === "vscode" || v === "jetbrains") return v;
      return DEFAULT_PREFERENCES.explorerGitColorScheme;
    })(),
    scmViewMode: parseScmViewMode(get<string>(KEY_SCM_VIEW_MODE)),
    terminalWebglEnabled:
      get<boolean>(KEY_TERMINAL_WEBGL_ENABLED) ??
      DEFAULT_PREFERENCES.terminalWebglEnabled,
    terminalCursorBlink:
      get<boolean>(KEY_TERMINAL_CURSOR_BLINK) ??
      DEFAULT_PREFERENCES.terminalCursorBlink,
    editorCursorBlink:
      get<boolean>(KEY_EDITOR_CURSOR_BLINK) ??
      DEFAULT_PREFERENCES.editorCursorBlink,
    editorCursorBlinkRate: clampToStep(
      get<number>(KEY_EDITOR_CURSOR_BLINK_RATE) ??
        DEFAULT_PREFERENCES.editorCursorBlinkRate,
      EDITOR_BLINK_RATE_MIN,
      EDITOR_BLINK_RATE_MAX,
      EDITOR_BLINK_RATE_STEP,
      EDITOR_BLINK_RATE_DEFAULT,
    ),
    editorCursorStyle: parseCursorStyle(get<string>(KEY_EDITOR_CURSOR_STYLE)),
    warnOnCloseTabWithRunningProcess:
      get<boolean>(KEY_WARN_ON_CLOSE_RUNNING) ??
      DEFAULT_PREFERENCES.warnOnCloseTabWithRunningProcess,
    warnOnCloseWorkspace:
      get<boolean>(KEY_WARN_ON_CLOSE_WORKSPACE) ??
      DEFAULT_PREFERENCES.warnOnCloseWorkspace,
    terminalFontFamily:
      get<string>(KEY_TERMINAL_FONT_FAMILY) ??
      DEFAULT_PREFERENCES.terminalFontFamily,
    terminalShell:
      get<string>(KEY_TERMINAL_SHELL) ?? DEFAULT_PREFERENCES.terminalShell,
    terminalFontWeight: coerceFontWeight(
      get<string>(KEY_TERMINAL_FONT_WEIGHT) ??
        DEFAULT_PREFERENCES.terminalFontWeight,
    ),
    terminalLetterSpacing:
      get<number>(KEY_TERMINAL_LETTER_SPACING) ??
      DEFAULT_PREFERENCES.terminalLetterSpacing,
    terminalFontSize:
      get<number>(KEY_TERMINAL_FONT_SIZE) ??
      DEFAULT_PREFERENCES.terminalFontSize,
    terminalLineHeight:
      get<number>(KEY_TERMINAL_LINE_HEIGHT) ??
      DEFAULT_PREFERENCES.terminalLineHeight,
    terminalScrollback: clampScrollback(
      get<number>(KEY_TERMINAL_SCROLLBACK) ??
        DEFAULT_PREFERENCES.terminalScrollback,
    ),
    terminalCursorStyle: parseCursorStyle(get<string>(KEY_TERMINAL_CURSOR_STYLE)),
    terminalCursorInactiveStyle: parseCursorInactiveStyle(
      get<string>(KEY_TERMINAL_CURSOR_INACTIVE_STYLE),
    ),
    terminalCursorWidth: clampToStep(
      get<number>(KEY_TERMINAL_CURSOR_WIDTH) ??
        DEFAULT_PREFERENCES.terminalCursorWidth,
      CURSOR_WIDTH_MIN,
      CURSOR_WIDTH_MAX,
      CURSOR_WIDTH_STEP,
      CURSOR_WIDTH_DEFAULT,
    ),
    terminalScrollSensitivity: clampToStep(
      get<number>(KEY_TERMINAL_SCROLL_SENSITIVITY) ??
        DEFAULT_PREFERENCES.terminalScrollSensitivity,
      SCROLL_SENSITIVITY_MIN,
      SCROLL_SENSITIVITY_MAX,
      SCROLL_SENSITIVITY_STEP,
      SCROLL_SENSITIVITY_DEFAULT,
    ),
    terminalNewFolderMode: parseTerminalNewFolderMode(
      get<string>(KEY_TERMINAL_NEW_FOLDER_MODE),
    ),
    lastWslDistro:
      get<string | null>(KEY_LAST_WSL_DISTRO) ??
      DEFAULT_PREFERENCES.lastWslDistro,
    zoomLevel: get<number>(KEY_ZOOM_LEVEL) ?? DEFAULT_PREFERENCES.zoomLevel,
    agentNotifications:
      get<boolean>(KEY_AGENT_NOTIFICATIONS) ??
      DEFAULT_PREFERENCES.agentNotifications,
    shortcuts: shortcutsValue ?? DEFAULT_PREFERENCES.shortcuts,
    editorAutoSave:
      get<boolean>(KEY_EDITOR_AUTO_SAVE) ??
      DEFAULT_PREFERENCES.editorAutoSave,
    editorAutoSaveDelay: clampAutoSaveDelay(
      get<number>(KEY_EDITOR_AUTO_SAVE_DELAY) ??
        DEFAULT_PREFERENCES.editorAutoSaveDelay,
    ),
    editorPreviewOnClick:
      get<boolean>(KEY_EDITOR_PREVIEW_ON_CLICK) ??
      DEFAULT_PREFERENCES.editorPreviewOnClick,
    editorViewByExt: (() => {
      const v = get<EditorViewMap>(KEY_EDITOR_VIEW_BY_EXT);
      const raw =
        v && typeof v === "object" && !Array.isArray(v)
          ? (v as EditorViewMap)
          : {};
      // Split any comma-separated keys written manually in the JSON.
      const normalized: EditorViewMap = {};
      for (const [key, value] of Object.entries(raw)) {
        if (!key.includes(",")) {
          normalized[key] = value;
        } else {
          for (const ext of key.split(",").map((e) => e.trim()).filter(Boolean)) {
            if (normalized[ext] === undefined) normalized[ext] = value;
          }
        }
      }
      if (Object.keys(normalized).length === 0) return buildColdStartMap();
      if (!normalized["*"]) return { ...normalized, "*": { ...CODE_DEFAULTS } };
      return normalized;
    })(),
    editorScrollPastEnd:
      get<boolean>(KEY_EDITOR_SCROLL_PAST_END) ??
      DEFAULT_PREFERENCES.editorScrollPastEnd,
    diffViewMode:
      get<DiffViewMode>(KEY_DIFF_VIEW_MODE) ?? DEFAULT_PREFERENCES.diffViewMode,
    editorHighlightActiveLine:
      get<boolean>(KEY_EDITOR_HIGHLIGHT_ACTIVE_LINE) ??
      DEFAULT_PREFERENCES.editorHighlightActiveLine,
    editorBracketMatching:
      get<boolean>(KEY_EDITOR_BRACKET_MATCHING) ??
      DEFAULT_PREFERENCES.editorBracketMatching,
    editorCloseBrackets:
      get<boolean>(KEY_EDITOR_CLOSE_BRACKETS) ??
      DEFAULT_PREFERENCES.editorCloseBrackets,
    editorAutocompletion:
      get<boolean>(KEY_EDITOR_AUTOCOMPLETION) ??
      DEFAULT_PREFERENCES.editorAutocompletion,
    tabBarStyle: (() => {
      const v = get<string>(KEY_TAB_BAR_STYLE);
      return v === "connected" || v === "pill" ? v : DEFAULT_PREFERENCES.tabBarStyle;
    })(),
    workspacePaneLimit: (() => {
      const v = get<number>(KEY_WORKSPACE_PANE_LIMIT);
      return Number.isFinite(v) && v! >= 1 ? Math.floor(v!) : DEFAULT_PREFERENCES.workspacePaneLimit;
    })(),
    paneSplitLimit: (() => {
      const v = get<PaneSplitLimit>(KEY_PANE_SPLIT_LIMIT);
      if (v && typeof v === "object" && Number.isFinite(v.width) && Number.isFinite(v.height)) {
        return { width: Math.max(1, v.width), height: Math.max(1, v.height) };
      }
      return DEFAULT_PREFERENCES.paneSplitLimit;
    })(),
    keepFolderLayoutOnChangeExplorerRoot:
      get<boolean>(KEY_KEEP_FOLDER_LAYOUT) ??
      DEFAULT_PREFERENCES.keepFolderLayoutOnChangeExplorerRoot,
    scratchpadEnterSends:
      get<boolean>(KEY_SCRATCHPAD_ENTER_SENDS) ??
      DEFAULT_PREFERENCES.scratchpadEnterSends,
    scratchpadInNewTerminals:
      get<boolean>(KEY_SCRATCHPAD_IN_NEW_TERMINALS) ??
      DEFAULT_PREFERENCES.scratchpadInNewTerminals,
    textEditorMode: parseTextEditorMode(get<string>(KEY_TEXT_EDITOR_MODE)),
    preferredFileEditorId:
      get<string | null>(KEY_PREFERRED_FILE_EDITOR_ID) ??
      DEFAULT_PREFERENCES.preferredFileEditorId,
    preferredWorkspaceEditorId:
      get<string | null>(KEY_PREFERRED_WORKSPACE_EDITOR_ID) ??
      DEFAULT_PREFERENCES.preferredWorkspaceEditorId,
    customEditors: (() => {
      const v = get<CustomEditor[]>(KEY_CUSTOM_EDITORS);
      return Array.isArray(v) ? v : DEFAULT_PREFERENCES.customEditors;
    })(),
    detectedEditors: (() => {
      const v = get<DetectedEditor[]>(KEY_DETECTED_EDITORS);
      return Array.isArray(v) ? v : DEFAULT_PREFERENCES.detectedEditors;
    })(),
    disabledDetectedEditorIds: (() => {
      const v = get<string[]>(KEY_DISABLED_DETECTED_IDS);
      return Array.isArray(v) ? v : DEFAULT_PREFERENCES.disabledDetectedEditorIds;
    })(),
  };

  // Persist any config keys that weren't present so they're discoverable in the JSON.
  const configDefaults: [string, unknown][] = [];
  if (!map.has(KEY_WORKSPACE_PANE_LIMIT)) configDefaults.push([KEY_WORKSPACE_PANE_LIMIT, DEFAULT_PREFERENCES.workspacePaneLimit]);
  if (!map.has(KEY_PANE_SPLIT_LIMIT)) configDefaults.push([KEY_PANE_SPLIT_LIMIT, DEFAULT_PREFERENCES.paneSplitLimit]);
  if (!map.has(KEY_KEEP_FOLDER_LAYOUT)) configDefaults.push([KEY_KEEP_FOLDER_LAYOUT, DEFAULT_PREFERENCES.keepFolderLayoutOnChangeExplorerRoot]);
  const storedExtMap = map.get(KEY_EDITOR_VIEW_BY_EXT);
  const storedExtKeys =
    storedExtMap && typeof storedExtMap === "object" && !Array.isArray(storedExtMap)
      ? Object.keys(storedExtMap as object)
      : [];
  const needsExtPersist =
    storedExtKeys.length === 0 ||
    !storedExtKeys.includes("*") ||
    storedExtKeys.some((k) => k.includes(","));
  if (needsExtPersist) {
    configDefaults.push([KEY_EDITOR_VIEW_BY_EXT, result.editorViewByExt]);
  }
  if (configDefaults.length > 0) {
    void Promise.all(configDefaults.map(([k, v]) => store.set(k, v))).then(() => store.save());
  }

  return result;
}

export async function setTheme(value: ThemePref): Promise<void> {
  await writePref(KEY_THEME, value);
}

export async function setThemeId(value: string): Promise<void> {
  await writePref(KEY_THEME_ID, value);
}

export async function setEditorTheme(value: EditorThemePref): Promise<void> {
  await writePref(KEY_EDITOR_THEME, value);
}

export async function setEditorFontFamily(value: string): Promise<void> {
  await writePref(KEY_EDITOR_FONT_FAMILY, value.trim());
}

export async function setEditorFontSize(value: number): Promise<void> {
  await writePref(
    KEY_EDITOR_FONT_SIZE,
    clampToStep(
      value,
      EDITOR_FONT_SIZE_MIN,
      EDITOR_FONT_SIZE_MAX,
      FONT_SIZE_STEP,
      EDITOR_FONT_SIZE_DEFAULT,
    ),
  );
}

export async function setEditorLetterSpacing(value: number): Promise<void> {
  await writePref(
    KEY_EDITOR_LETTER_SPACING,
    clampToStep(
      value,
      LETTER_SPACING_MIN,
      LETTER_SPACING_MAX,
      LETTER_SPACING_STEP,
      LETTER_SPACING_DEFAULT,
    ),
  );
}

export async function setEditorLineHeight(value: number): Promise<void> {
  await writePref(
    KEY_EDITOR_LINE_HEIGHT,
    clampToStep(
      value,
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX,
      LINE_HEIGHT_STEP,
      EDITOR_LINE_HEIGHT_DEFAULT,
    ),
  );
}

export async function setAutostart(value: boolean): Promise<void> {
  await writePref(KEY_AUTOSTART, value);
}

export async function setAutofocusNewTabs(value: boolean): Promise<void> {
  await writePref(KEY_AUTOFOCUS_NEW_TABS, value);
}

export async function setExplorerGitColorScheme(value: GitColorScheme): Promise<void> {
  await writePref(KEY_EXPLORER_GIT_COLOR_SCHEME, value);
}

export async function setScmViewMode(value: ScmViewMode): Promise<void> {
  await writePref(KEY_SCM_VIEW_MODE, value);
}

export async function setTerminalWebglEnabled(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_WEBGL_ENABLED, value);
}

export async function setTerminalCursorBlink(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_CURSOR_BLINK, value);
}

export async function setEditorCursorBlink(value: boolean): Promise<void> {
  await writePref(KEY_EDITOR_CURSOR_BLINK, value);
}

export async function setEditorCursorBlinkRate(value: number): Promise<void> {
  await writePref(
    KEY_EDITOR_CURSOR_BLINK_RATE,
    clampToStep(
      value,
      EDITOR_BLINK_RATE_MIN,
      EDITOR_BLINK_RATE_MAX,
      EDITOR_BLINK_RATE_STEP,
      EDITOR_BLINK_RATE_DEFAULT,
    ),
  );
}

export async function setEditorCursorStyle(value: CursorStyle): Promise<void> {
  await writePref(KEY_EDITOR_CURSOR_STYLE, value);
}

export async function setWarnOnCloseTabWithRunningProcess(value: boolean): Promise<void> {
  await writePref(KEY_WARN_ON_CLOSE_RUNNING, value);
}

export async function setWarnOnCloseWorkspace(value: boolean): Promise<void> {
  await writePref(KEY_WARN_ON_CLOSE_WORKSPACE, value);
}

export async function setTerminalNewFolderMode(
  value: TerminalNewFolderMode,
): Promise<void> {
  await writePref(KEY_TERMINAL_NEW_FOLDER_MODE, value);
}

export async function setTerminalFontFamily(value: string): Promise<void> {
  await writePref(KEY_TERMINAL_FONT_FAMILY, value.trim());
}

export async function setTerminalShell(value: string): Promise<void> {
  await writePref(KEY_TERMINAL_SHELL, value);
}

const TERMINAL_FONT_WEIGHT_VALUES = new Set(["normal", "500", "600", "bold"]);

export function coerceFontWeight(value: string): string {
  const v = value.trim();
  return TERMINAL_FONT_WEIGHT_VALUES.has(v) ? v : "normal";
}

export async function setTerminalFontWeight(value: string): Promise<void> {
  await writePref(KEY_TERMINAL_FONT_WEIGHT, coerceFontWeight(value));
}

export async function setTerminalLetterSpacing(value: number): Promise<void> {
  await writePref(
    KEY_TERMINAL_LETTER_SPACING,
    clampToStep(
      value,
      LETTER_SPACING_MIN,
      LETTER_SPACING_MAX,
      LETTER_SPACING_STEP,
      LETTER_SPACING_DEFAULT,
    ),
  );
}

export async function setTerminalFontSize(value: number): Promise<void> {
  await writePref(
    KEY_TERMINAL_FONT_SIZE,
    clampToStep(
      value,
      TERMINAL_FONT_SIZE_MIN,
      TERMINAL_FONT_SIZE_MAX,
      FONT_SIZE_STEP,
      TERMINAL_FONT_SIZE_DEFAULT,
    ),
  );
}

export async function setTerminalLineHeight(value: number): Promise<void> {
  await writePref(
    KEY_TERMINAL_LINE_HEIGHT,
    clampToStep(
      value,
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX,
      LINE_HEIGHT_STEP,
      TERMINAL_LINE_HEIGHT_DEFAULT,
    ),
  );
}

function clampScrollback(value: number): number {
  if (!Number.isFinite(value)) return TERMINAL_SCROLLBACK_DEFAULT;
  return Math.min(
    TERMINAL_SCROLLBACK_MAX,
    Math.max(TERMINAL_SCROLLBACK_MIN, Math.round(value)),
  );
}

export async function setTerminalScrollback(value: number): Promise<void> {
  await writePref(KEY_TERMINAL_SCROLLBACK, clampScrollback(value));
}

export async function setTerminalCursorStyle(value: CursorStyle): Promise<void> {
  await writePref(KEY_TERMINAL_CURSOR_STYLE, parseCursorStyle(value));
}

export async function setTerminalCursorInactiveStyle(
  value: CursorInactiveStyle,
): Promise<void> {
  await writePref(
    KEY_TERMINAL_CURSOR_INACTIVE_STYLE,
    parseCursorInactiveStyle(value),
  );
}

export async function setTerminalCursorWidth(value: number): Promise<void> {
  await writePref(
    KEY_TERMINAL_CURSOR_WIDTH,
    clampToStep(
      value,
      CURSOR_WIDTH_MIN,
      CURSOR_WIDTH_MAX,
      CURSOR_WIDTH_STEP,
      CURSOR_WIDTH_DEFAULT,
    ),
  );
}

export async function setTerminalScrollSensitivity(
  value: number,
): Promise<void> {
  await writePref(
    KEY_TERMINAL_SCROLL_SENSITIVITY,
    clampToStep(
      value,
      SCROLL_SENSITIVITY_MIN,
      SCROLL_SENSITIVITY_MAX,
      SCROLL_SENSITIVITY_STEP,
      SCROLL_SENSITIVITY_DEFAULT,
    ),
  );
}

export async function setLastWslDistro(value: string | null): Promise<void> {
  await writePref(KEY_LAST_WSL_DISTRO, value);
}

export async function setTerminalScratchpadEnterSends(value: boolean): Promise<void> {
  await writePref(KEY_SCRATCHPAD_ENTER_SENDS, value);
}

export async function setTerminalScratchpadInNewTerminals(value: boolean): Promise<void> {
  await writePref(KEY_SCRATCHPAD_IN_NEW_TERMINALS, value);
}

export async function setPreferredFileEditorId(value: string | null): Promise<void> {
  await writeToolsPref(KEY_PREFERRED_FILE_EDITOR_ID, value);
}

export async function setPreferredWorkspaceEditorId(value: string | null): Promise<void> {
  await writeToolsPref(KEY_PREFERRED_WORKSPACE_EDITOR_ID, value);
}

export async function setTextEditorMode(value: TextEditorMode): Promise<void> {
  await writeToolsPref(KEY_TEXT_EDITOR_MODE, value);
}

export async function setCustomEditors(value: CustomEditor[]): Promise<void> {
  await writeToolsPref(KEY_CUSTOM_EDITORS, value);
}

export async function setDetectedEditors(value: DetectedEditor[]): Promise<void> {
  await writeToolsPref(KEY_DETECTED_EDITORS, value);
}

export async function setDisabledDetectedEditorIds(value: string[]): Promise<void> {
  await writeToolsPref(KEY_DISABLED_DETECTED_IDS, value);
}

export async function setZoomLevel(value: number): Promise<void> {
  await writePref(KEY_ZOOM_LEVEL, value);
}

function clampAutoSaveDelay(v: number): number {
  if (!Number.isFinite(v)) return 15000;
  return Math.min(60000, Math.max(100, Math.round(v)));
}

export async function setEditorAutoSave(value: boolean): Promise<void> {
  await writePref(KEY_EDITOR_AUTO_SAVE, value);
}

export async function setEditorAutoSaveDelay(value: number): Promise<void> {
  await writePref(KEY_EDITOR_AUTO_SAVE_DELAY, clampAutoSaveDelay(value));
}

export async function setEditorPreviewOnClick(value: boolean): Promise<void> {
  await writePref(KEY_EDITOR_PREVIEW_ON_CLICK, value);
}

export async function setEditorViewForExt(
  ext: string,
  value: EditorViewSettings,
): Promise<void> {
  const current =
    (await store.get<EditorViewMap>(KEY_EDITOR_VIEW_BY_EXT)) ?? {};
  await writePref(KEY_EDITOR_VIEW_BY_EXT, { ...current, [ext]: value });
}

export async function addEditorViewEntries(exts: string[]): Promise<void> {
  const current =
    (await store.get<EditorViewMap>(KEY_EDITOR_VIEW_BY_EXT)) ?? {};
  const starBase: EditorViewSettings = { ...CODE_DEFAULTS, ...(current["*"] ?? {}) };
  const next = { ...current };
  for (const ext of exts) {
    if (ext && ext !== "*" && next[ext] === undefined) {
      next[ext] = { ...starBase };
    }
  }
  await writePref(KEY_EDITOR_VIEW_BY_EXT, next);
}

export async function patchEditorViewEntry(
  key: string,
  patch: Partial<EditorViewSettings>,
): Promise<void> {
  const current =
    (await store.get<EditorViewMap>(KEY_EDITOR_VIEW_BY_EXT)) ?? {};
  if (current[key] === undefined) return;
  const next = { ...current, [key]: { ...current[key], ...patch } };
  await writePref(KEY_EDITOR_VIEW_BY_EXT, next);
}

export async function deleteEditorViewEntry(key: string): Promise<void> {
  if (key === "*") return;
  const current =
    (await store.get<EditorViewMap>(KEY_EDITOR_VIEW_BY_EXT)) ?? {};
  const next = { ...current };
  delete next[key];
  await writePref(KEY_EDITOR_VIEW_BY_EXT, next);
}

export async function resetEditorViewEntry(): Promise<void> {
  const current =
    (await store.get<EditorViewMap>(KEY_EDITOR_VIEW_BY_EXT)) ?? {};
  await writePref(KEY_EDITOR_VIEW_BY_EXT, { ...current, "*": { ...CODE_DEFAULTS } });
}

export async function setEditorScrollPastEnd(value: boolean): Promise<void> {
  await writePref(KEY_EDITOR_SCROLL_PAST_END, value);
}

export async function setDiffViewMode(value: DiffViewMode): Promise<void> {
  await writePref(KEY_DIFF_VIEW_MODE, value);
}

export async function setEditorBracketMatching(value: boolean): Promise<void> {
  await writePref(KEY_EDITOR_BRACKET_MATCHING, value);
}

export async function setEditorCloseBrackets(value: boolean): Promise<void> {
  await writePref(KEY_EDITOR_CLOSE_BRACKETS, value);
}

export async function setEditorAutocompletion(value: boolean): Promise<void> {
  await writePref(KEY_EDITOR_AUTOCOMPLETION, value);
}

export async function setAgentNotifications(value: boolean): Promise<void> {
  await writePref(KEY_AGENT_NOTIFICATIONS, value);
}


export async function setShortcuts(
  value: Record<ShortcutId, KeyBinding[]> | {},
): Promise<void> {
  await writeShortcutsPref(value);
}

export async function resetShortcuts(): Promise<void> {
  await writeShortcutsPref(DEFAULT_PREFERENCES.shortcuts);
}

export async function setTabBarStyle(value: TabBarStyle): Promise<void> {
  await writePref(KEY_TAB_BAR_STYLE, value);
}

export type PrefKey = keyof Preferences;

// Defined once; maps store keys to Preferences property names. Any preference
// written through writePref must appear here, or onPreferencesChange drops the
// update and live windows never see the new value.
export const PREF_KEY_MAP: Record<string, PrefKey> = {
  [KEY_THEME]: "theme",
  [KEY_THEME_ID]: "themeId",
  [KEY_EDITOR_THEME]: "editorTheme",
  [KEY_EDITOR_FONT_FAMILY]: "editorFontFamily",
  [KEY_EDITOR_FONT_SIZE]: "editorFontSize",
  [KEY_EDITOR_LETTER_SPACING]: "editorLetterSpacing",
  [KEY_EDITOR_LINE_HEIGHT]: "editorLineHeight",
  [KEY_AUTOSTART]: "autostart",
  [KEY_AUTOFOCUS_NEW_TABS]: "autofocusNewTabs",
  [KEY_EXPLORER_GIT_COLOR_SCHEME]: "explorerGitColorScheme",
  [KEY_SCM_VIEW_MODE]: "scmViewMode",
  [KEY_TERMINAL_WEBGL_ENABLED]: "terminalWebglEnabled",
  [KEY_TERMINAL_CURSOR_BLINK]: "terminalCursorBlink",
  [KEY_EDITOR_CURSOR_BLINK]: "editorCursorBlink",
  [KEY_EDITOR_CURSOR_BLINK_RATE]: "editorCursorBlinkRate",
  [KEY_EDITOR_CURSOR_STYLE]: "editorCursorStyle",
  [KEY_WARN_ON_CLOSE_RUNNING]: "warnOnCloseTabWithRunningProcess",
  [KEY_WARN_ON_CLOSE_WORKSPACE]: "warnOnCloseWorkspace",
  [KEY_TERMINAL_FONT_FAMILY]: "terminalFontFamily",
  [KEY_TERMINAL_SHELL]: "terminalShell",
  [KEY_TERMINAL_FONT_WEIGHT]: "terminalFontWeight",
  [KEY_TERMINAL_LETTER_SPACING]: "terminalLetterSpacing",
  [KEY_TERMINAL_FONT_SIZE]: "terminalFontSize",
  [KEY_TERMINAL_LINE_HEIGHT]: "terminalLineHeight",
  [KEY_TERMINAL_SCROLLBACK]: "terminalScrollback",
  [KEY_TERMINAL_CURSOR_STYLE]: "terminalCursorStyle",
  [KEY_TERMINAL_CURSOR_INACTIVE_STYLE]: "terminalCursorInactiveStyle",
  [KEY_TERMINAL_CURSOR_WIDTH]: "terminalCursorWidth",
  [KEY_TERMINAL_SCROLL_SENSITIVITY]: "terminalScrollSensitivity",
  [KEY_LAST_WSL_DISTRO]: "lastWslDistro",
  [KEY_ZOOM_LEVEL]: "zoomLevel",
  [KEY_AGENT_NOTIFICATIONS]: "agentNotifications",
  [KEY_SHORTCUTS]: "shortcuts",
  [KEY_EDITOR_AUTO_SAVE]: "editorAutoSave",
  [KEY_EDITOR_AUTO_SAVE_DELAY]: "editorAutoSaveDelay",
  [KEY_EDITOR_PREVIEW_ON_CLICK]: "editorPreviewOnClick",
  [KEY_EDITOR_VIEW_BY_EXT]: "editorViewByExt",
  [KEY_EDITOR_SCROLL_PAST_END]: "editorScrollPastEnd",
  [KEY_DIFF_VIEW_MODE]: "diffViewMode",
  [KEY_EDITOR_HIGHLIGHT_ACTIVE_LINE]: "editorHighlightActiveLine",
  [KEY_EDITOR_BRACKET_MATCHING]: "editorBracketMatching",
  [KEY_EDITOR_CLOSE_BRACKETS]: "editorCloseBrackets",
  [KEY_EDITOR_AUTOCOMPLETION]: "editorAutocompletion",
  [KEY_TAB_BAR_STYLE]: "tabBarStyle",
  [KEY_TERMINAL_NEW_FOLDER_MODE]: "terminalNewFolderMode",
  [KEY_SCRATCHPAD_ENTER_SENDS]: "scratchpadEnterSends",
  [KEY_SCRATCHPAD_IN_NEW_TERMINALS]: "scratchpadInNewTerminals",
  [KEY_TEXT_EDITOR_MODE]: "textEditorMode",
  [KEY_PREFERRED_FILE_EDITOR_ID]: "preferredFileEditorId",
  [KEY_PREFERRED_WORKSPACE_EDITOR_ID]: "preferredWorkspaceEditorId",
  [KEY_CUSTOM_EDITORS]: "customEditors",
  [KEY_DETECTED_EDITORS]: "detectedEditors",
  [KEY_DISABLED_DETECTED_IDS]: "disabledDetectedEditorIds",
};

/** Subscribe to changes from any window (settings → main). */
export async function onPreferencesChange(
  cb: (key: PrefKey, value: unknown) => void,
): Promise<UnlistenFn> {
  // Same-process writes still fire onChange immediately; cross-window writes
  // arrive via the Tauri event emitted by writePref().
  const unsubLocal = await store.onChange<unknown>((key, value) => {
    const mapped = PREF_KEY_MAP[key];
    if (mapped) cb(mapped, value);
  });
  const unsubTools = await toolsStore.onChange<unknown>((key, value) => {
    const mapped = PREF_KEY_MAP[key];
    if (mapped) cb(mapped, value);
  });
  const unsubShortcuts = await shortcutsStore.onChange<unknown>((key, value) => {
    const mapped = PREF_KEY_MAP[key];
    if (mapped) cb(mapped, value);
  });
  const unsubEvent = await listen<{ key: string; value: unknown }>(
    PREFS_CHANGED_EVENT,
    (e) => {
      const mapped = PREF_KEY_MAP[e.payload.key];
      if (mapped) cb(mapped, e.payload.value);
    },
  );
  return () => {
    unsubLocal();
    unsubTools();
    unsubShortcuts();
    unsubEvent();
  };
}
