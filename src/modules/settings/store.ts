import type { KeyBinding, ShortcutId } from "@/modules/shortcuts/shortcuts";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";

export type ThemePref = "system" | "light" | "dark";

export type TabBarStyle = "connected" | "pill";

export type GitColorScheme = "vscode" | "jetbrains";

export const DEFAULT_THEME_ID = "kex-default";

export const EDITOR_THEMES = [
  "atomone",
  "aura",
  "copilot",
  "github-dark",
  "github-light",
  "gruvbox-dark",
  "nord",
  "tokyo-night",
  "xcode-dark",
  "xcode-light",
] as const;

export type EditorThemeId = (typeof EDITOR_THEMES)[number];

export const EDITOR_THEME_LABELS: Record<EditorThemeId, string> = {
  atomone: "Atom One",
  aura: "Aura",
  copilot: "Copilot",
  "github-dark": "GitHub Dark",
  "github-light": "GitHub Light",
  "gruvbox-dark": "Gruvbox Dark",
  nord: "Nord",
  "tokyo-night": "Tokyo Night",
  "xcode-dark": "Xcode Dark",
  "xcode-light": "Xcode Light",
};

export type PaneSplitLimit = { width: number; height: number };

export type Preferences = {
  theme: ThemePref;
  themeId: string;
  editorTheme: EditorThemeId;
  autostart: boolean;
  vimMode: boolean;
  showHidden: boolean;
  explorerGitColorScheme: GitColorScheme;
  terminalWebglEnabled: boolean;
  terminalCursorBlink: boolean;
  warnOnCloseTabWithRunningProcess: boolean;
  terminalFontFamily: string;
  terminalLetterSpacing: number;
  terminalFontSize: number;
  terminalScrollback: number;
  lastWslDistro: string | null;
  zoomLevel: number;
  agentNotifications: boolean;
  shortcuts: Record<ShortcutId, KeyBinding[]>;
  editorAutoSave: boolean;
  editorAutoSaveDelay: number;
  editorPreviewOnClick: boolean;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  rightPanelActiveTab: "explorer" | "git" | "history";
  panelSide: "left" | "right";
  tabBarStyle: TabBarStyle;
  workspacePaneLimit: number;
  paneSplitLimit: PaneSplitLimit;
};

const STORE_PATH = "kex-settings.json";
const KEY_THEME = "theme";
const KEY_THEME_ID = "themeId";
const KEY_EDITOR_THEME = "editorTheme";
const KEY_AUTOSTART = "autostart";
const KEY_VIM_MODE = "vimMode";
const KEY_SHOW_HIDDEN = "showHidden";
const LEGACY_KEY_SHOW_HIDDEN_DIRS = "showHiddenDirectories";
const KEY_EXPLORER_GIT_COLOR_SCHEME = "explorerGitColorScheme";
const KEY_TERMINAL_WEBGL_ENABLED = "terminalWebglEnabled";
const KEY_TERMINAL_CURSOR_BLINK = "terminalCursorBlink";
const KEY_WARN_ON_CLOSE_RUNNING = "warnOnCloseTabWithRunningProcess";
const KEY_TERMINAL_FONT_FAMILY = "terminalFontFamily";
const KEY_TERMINAL_LETTER_SPACING = "terminalLetterSpacing";
const KEY_TERMINAL_FONT_SIZE = "terminalFontSize";
const KEY_TERMINAL_SCROLLBACK = "terminalScrollback";
const KEY_LAST_WSL_DISTRO = "lastWslDistro";
const KEY_ZOOM_LEVEL = "zoomLevel";
const KEY_AGENT_NOTIFICATIONS = "agentNotifications";
const KEY_SHORTCUTS = "shortcuts";
const KEY_EDITOR_AUTO_SAVE = "editorAutoSave";
const KEY_EDITOR_AUTO_SAVE_DELAY = "editorAutoSaveDelay";
const KEY_EDITOR_PREVIEW_ON_CLICK = "editorPreviewOnClick";
const KEY_RIGHT_PANEL_OPEN = "rightPanelOpen";
const KEY_RIGHT_PANEL_WIDTH = "rightPanelWidth";
const KEY_RIGHT_PANEL_ACTIVE_TAB = "rightPanelActiveTab";
const KEY_PANEL_SIDE = "panelSide";
const KEY_TAB_BAR_STYLE = "tabBarStyle";
const KEY_WORKSPACE_PANE_LIMIT = "workspacePaneLimit";
const KEY_PANE_SPLIT_LIMIT = "paneSplitLimit";

export const TERMINAL_FONT_SIZE_DEFAULT = 14;
export const TERMINAL_FONT_SIZE_MIN = 8;
export const TERMINAL_FONT_SIZE_MAX = 32;

export const TERMINAL_FONT_SIZES = [
  10, 12, 13, 14, 15, 16, 18, 20, 22, 24,
] as const;

export const TERMINAL_SCROLLBACK_DEFAULT = 2000;
export const TERMINAL_SCROLLBACK_MIN = 200;
export const TERMINAL_SCROLLBACK_MAX = 50_000;
export const TERMINAL_SCROLLBACK_PRESETS = [
  500, 1000, 2000, 5000, 10_000, 25_000,
] as const;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  themeId: DEFAULT_THEME_ID,
  editorTheme: "atomone",
  autostart: false,
  vimMode: false,
  showHidden: false,
  explorerGitColorScheme: "vscode",
  terminalWebglEnabled: true,
  terminalCursorBlink: false,
  warnOnCloseTabWithRunningProcess: true,
  terminalFontFamily: "",
  terminalLetterSpacing: 0,
  terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
  terminalScrollback: TERMINAL_SCROLLBACK_DEFAULT,
  lastWslDistro: null,
  zoomLevel: 1.0,
  agentNotifications: true,
  shortcuts: {} as Record<ShortcutId, KeyBinding[]>,
  editorAutoSave: false,
  editorAutoSaveDelay: 15000,
  editorPreviewOnClick: true,
  rightPanelOpen: true,
  rightPanelWidth: 240,
  rightPanelActiveTab: "explorer",
  panelSide: "right",
  tabBarStyle: "connected",
  workspacePaneLimit: 8,
  paneSplitLimit: { width: 250, height: 250 },
};

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

// LazyStore.onChange only fires within the writing process. The settings
// page lives in a separate webview, so writes there never reach the main
// window's subscribers. Mirror every setter through a Tauri event so any
// window can listen.
const PREFS_CHANGED_EVENT = "kex://prefs-changed";

async function writePref<T>(key: string, value: T): Promise<void> {
  await store.set(key, value);
  await store.save();
  await emit(PREFS_CHANGED_EVENT, { key, value });
}

export async function loadPreferences(): Promise<Preferences> {
  // Single IPC roundtrip — fetching keys individually fans out to one
  // `plugin:store|get` per setting and is the dominant boot cost.
  const entries = await store.entries();
  const map = new Map<string, unknown>(entries);
  const get = <T>(k: string): T | undefined => map.get(k) as T | undefined;
  const result: Preferences = {
    theme: get<ThemePref>(KEY_THEME) ?? DEFAULT_PREFERENCES.theme,
    themeId: get<string>(KEY_THEME_ID) ?? DEFAULT_PREFERENCES.themeId,
    editorTheme:
      get<EditorThemeId>(KEY_EDITOR_THEME) ?? DEFAULT_PREFERENCES.editorTheme,
    autostart: get<boolean>(KEY_AUTOSTART) ?? DEFAULT_PREFERENCES.autostart,
    vimMode: get<boolean>(KEY_VIM_MODE) ?? DEFAULT_PREFERENCES.vimMode,
    showHidden:
      get<boolean>(KEY_SHOW_HIDDEN) ??
      get<boolean>(LEGACY_KEY_SHOW_HIDDEN_DIRS) ??
      DEFAULT_PREFERENCES.showHidden,
    explorerGitColorScheme: (() => {
      const v = get<string>(KEY_EXPLORER_GIT_COLOR_SCHEME);
      if (v === "vscode" || v === "jetbrains") return v;
      return DEFAULT_PREFERENCES.explorerGitColorScheme;
    })(),
    terminalWebglEnabled:
      get<boolean>(KEY_TERMINAL_WEBGL_ENABLED) ??
      DEFAULT_PREFERENCES.terminalWebglEnabled,
    terminalCursorBlink:
      get<boolean>(KEY_TERMINAL_CURSOR_BLINK) ??
      DEFAULT_PREFERENCES.terminalCursorBlink,
    warnOnCloseTabWithRunningProcess:
      get<boolean>(KEY_WARN_ON_CLOSE_RUNNING) ??
      DEFAULT_PREFERENCES.warnOnCloseTabWithRunningProcess,
    terminalFontFamily:
      get<string>(KEY_TERMINAL_FONT_FAMILY) ??
      DEFAULT_PREFERENCES.terminalFontFamily,
    terminalLetterSpacing:
      get<number>(KEY_TERMINAL_LETTER_SPACING) ??
      DEFAULT_PREFERENCES.terminalLetterSpacing,
    terminalFontSize:
      get<number>(KEY_TERMINAL_FONT_SIZE) ??
      DEFAULT_PREFERENCES.terminalFontSize,
    terminalScrollback: clampScrollback(
      get<number>(KEY_TERMINAL_SCROLLBACK) ??
        DEFAULT_PREFERENCES.terminalScrollback,
    ),
    lastWslDistro:
      get<string | null>(KEY_LAST_WSL_DISTRO) ??
      DEFAULT_PREFERENCES.lastWslDistro,
    zoomLevel: get<number>(KEY_ZOOM_LEVEL) ?? DEFAULT_PREFERENCES.zoomLevel,
    agentNotifications:
      get<boolean>(KEY_AGENT_NOTIFICATIONS) ??
      DEFAULT_PREFERENCES.agentNotifications,
    shortcuts:
      get<Record<ShortcutId, KeyBinding[]>>(KEY_SHORTCUTS) ??
      DEFAULT_PREFERENCES.shortcuts,
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
    rightPanelOpen:
      get<boolean>(KEY_RIGHT_PANEL_OPEN) ?? DEFAULT_PREFERENCES.rightPanelOpen,
    rightPanelWidth: (() => {
      const w = get<number>(KEY_RIGHT_PANEL_WIDTH) ?? DEFAULT_PREFERENCES.rightPanelWidth;
      return Number.isFinite(w) ? Math.min(480, Math.max(160, w)) : DEFAULT_PREFERENCES.rightPanelWidth;
    })(),
    rightPanelActiveTab:
      get<"explorer" | "git" | "history">(KEY_RIGHT_PANEL_ACTIVE_TAB) ??
      DEFAULT_PREFERENCES.rightPanelActiveTab,
    panelSide: (() => {
      const v = get<string>(KEY_PANEL_SIDE);
      return v === "left" || v === "right" ? v : DEFAULT_PREFERENCES.panelSide;
    })(),
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
  };

  // Persist any config keys that weren't present so they're discoverable in the JSON.
  const configDefaults: [string, unknown][] = [];
  if (!map.has(KEY_WORKSPACE_PANE_LIMIT)) configDefaults.push([KEY_WORKSPACE_PANE_LIMIT, DEFAULT_PREFERENCES.workspacePaneLimit]);
  if (!map.has(KEY_PANE_SPLIT_LIMIT)) configDefaults.push([KEY_PANE_SPLIT_LIMIT, DEFAULT_PREFERENCES.paneSplitLimit]);
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

export async function setEditorTheme(value: EditorThemeId): Promise<void> {
  await writePref(KEY_EDITOR_THEME, value);
}

export async function setAutostart(value: boolean): Promise<void> {
  await writePref(KEY_AUTOSTART, value);
}

export async function setVimMode(value: boolean): Promise<void> {
  await writePref(KEY_VIM_MODE, value);
}

export async function setShowHidden(value: boolean): Promise<void> {
  await writePref(KEY_SHOW_HIDDEN, value);
}

export async function setExplorerGitColorScheme(value: GitColorScheme): Promise<void> {
  await writePref(KEY_EXPLORER_GIT_COLOR_SCHEME, value);
}

export async function setTerminalWebglEnabled(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_WEBGL_ENABLED, value);
}

export async function setTerminalCursorBlink(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_CURSOR_BLINK, value);
}

export async function setWarnOnCloseTabWithRunningProcess(value: boolean): Promise<void> {
  await writePref(KEY_WARN_ON_CLOSE_RUNNING, value);
}

export async function setTerminalFontFamily(value: string): Promise<void> {
  await writePref(KEY_TERMINAL_FONT_FAMILY, value.trim());
}

export async function setTerminalLetterSpacing(value: number): Promise<void> {
  const clamped = Number.isFinite(value) ? Math.max(-10, Math.min(10, Math.round(value))) : 0;
  await writePref(KEY_TERMINAL_LETTER_SPACING, clamped);
}

export async function setTerminalFontSize(value: number): Promise<void> {
  const clamped = Number.isFinite(value)
    ? Math.min(
        TERMINAL_FONT_SIZE_MAX,
        Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(value)),
      )
    : TERMINAL_FONT_SIZE_DEFAULT;
  await writePref(KEY_TERMINAL_FONT_SIZE, clamped);
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

export async function setLastWslDistro(value: string | null): Promise<void> {
  await writePref(KEY_LAST_WSL_DISTRO, value);
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

export async function setAgentNotifications(value: boolean): Promise<void> {
  await writePref(KEY_AGENT_NOTIFICATIONS, value);
}


export async function setShortcuts(
  value: Record<ShortcutId, KeyBinding[]> | {},
): Promise<void> {
  await writePref(KEY_SHORTCUTS, value);
}

export async function resetShortcuts(): Promise<void> {
  await writePref(KEY_SHORTCUTS, DEFAULT_PREFERENCES.shortcuts);
}

export async function setRightPanelOpen(value: boolean): Promise<void> {
  await writePref(KEY_RIGHT_PANEL_OPEN, value);
}

export async function setRightPanelWidth(value: number): Promise<void> {
  const clamped = Number.isFinite(value) ? Math.min(480, Math.max(160, Math.round(value))) : 240;
  await writePref(KEY_RIGHT_PANEL_WIDTH, clamped);
}

export async function setRightPanelActiveTab(
  value: "explorer" | "git" | "history",
): Promise<void> {
  await writePref(KEY_RIGHT_PANEL_ACTIVE_TAB, value);
}

export async function setPanelSide(value: "left" | "right"): Promise<void> {
  await writePref(KEY_PANEL_SIDE, value);
}

export async function setTabBarStyle(value: TabBarStyle): Promise<void> {
  await writePref(KEY_TAB_BAR_STYLE, value);
}

export type PrefKey = keyof Preferences;

// Defined once; maps store keys to Preferences property names.
const PREF_KEY_MAP: Record<string, PrefKey> = {
  [KEY_THEME]: "theme",
  [KEY_THEME_ID]: "themeId",
  [KEY_EDITOR_THEME]: "editorTheme",
  [KEY_AUTOSTART]: "autostart",
  [KEY_VIM_MODE]: "vimMode",
  [KEY_SHOW_HIDDEN]: "showHidden",
  [KEY_EXPLORER_GIT_COLOR_SCHEME]: "explorerGitColorScheme",
  [KEY_TERMINAL_WEBGL_ENABLED]: "terminalWebglEnabled",
  [KEY_TERMINAL_CURSOR_BLINK]: "terminalCursorBlink",
  [KEY_WARN_ON_CLOSE_RUNNING]: "warnOnCloseTabWithRunningProcess",
  [KEY_TERMINAL_FONT_FAMILY]: "terminalFontFamily",
  [KEY_TERMINAL_LETTER_SPACING]: "terminalLetterSpacing",
  [KEY_TERMINAL_FONT_SIZE]: "terminalFontSize",
  [KEY_TERMINAL_SCROLLBACK]: "terminalScrollback",
  [KEY_LAST_WSL_DISTRO]: "lastWslDistro",
  [KEY_ZOOM_LEVEL]: "zoomLevel",
  [KEY_AGENT_NOTIFICATIONS]: "agentNotifications",
  [KEY_SHORTCUTS]: "shortcuts",
  [KEY_EDITOR_AUTO_SAVE]: "editorAutoSave",
  [KEY_EDITOR_AUTO_SAVE_DELAY]: "editorAutoSaveDelay",
  [KEY_EDITOR_PREVIEW_ON_CLICK]: "editorPreviewOnClick",
  [KEY_RIGHT_PANEL_OPEN]: "rightPanelOpen",
  [KEY_RIGHT_PANEL_WIDTH]: "rightPanelWidth",
  [KEY_RIGHT_PANEL_ACTIVE_TAB]: "rightPanelActiveTab",
  [KEY_PANEL_SIDE]: "panelSide",
  [KEY_TAB_BAR_STYLE]: "tabBarStyle",
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
  const unsubEvent = await listen<{ key: string; value: unknown }>(
    PREFS_CHANGED_EVENT,
    (e) => {
      const mapped = PREF_KEY_MAP[e.payload.key];
      if (mapped) cb(mapped, e.payload.value);
    },
  );
  return () => {
    unsubLocal();
    unsubEvent();
  };
}
