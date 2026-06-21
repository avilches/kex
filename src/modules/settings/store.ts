import type { KeyBinding, ShortcutId } from "@/modules/shortcuts/shortcuts";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";

export type ThemePref = "system" | "light" | "dark";

export type TabBarStyle = "connected" | "pill";

export type GitColorScheme = "vscode" | "jetbrains";

export type ScmViewMode = "list" | "tree";

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
  editorFontFamily: string;
  editorFontSize: number;
  editorLetterSpacing: number;
  editorLineHeight: number;
  autostart: boolean;
  vimMode: boolean;
  showHidden: boolean;
  explorerGitColorScheme: GitColorScheme;
  scmViewMode: ScmViewMode;
  terminalWebglEnabled: boolean;
  terminalCursorBlink: boolean;
  warnOnCloseTabWithRunningProcess: boolean;
  terminalFontFamily: string;
  terminalLetterSpacing: number;
  terminalFontSize: number;
  terminalLineHeight: number;
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
  keepFolderLayoutOnChangeExplorerRoot: boolean;
};

const STORE_PATH = "settings-general.json";
const SHORTCUTS_STORE_PATH = "settings-shortcuts.json";
const KEY_THEME = "theme";
const KEY_THEME_ID = "themeId";
const KEY_EDITOR_THEME = "editorTheme";
const KEY_EDITOR_FONT_FAMILY = "editorFontFamily";
const KEY_EDITOR_FONT_SIZE = "editorFontSize";
const KEY_EDITOR_LETTER_SPACING = "editorLetterSpacing";
const KEY_EDITOR_LINE_HEIGHT = "editorLineHeight";
const KEY_AUTOSTART = "autostart";
const KEY_VIM_MODE = "vimMode";
const KEY_SHOW_HIDDEN = "showHidden";
const LEGACY_KEY_SHOW_HIDDEN_DIRS = "showHiddenDirectories";
const KEY_EXPLORER_GIT_COLOR_SCHEME = "explorerGitColorScheme";
const KEY_SCM_VIEW_MODE = "scmViewMode";
const KEY_TERMINAL_WEBGL_ENABLED = "terminalWebglEnabled";
const KEY_TERMINAL_CURSOR_BLINK = "terminalCursorBlink";
const KEY_WARN_ON_CLOSE_RUNNING = "warnOnCloseTabWithRunningProcess";
const KEY_TERMINAL_FONT_FAMILY = "terminalFontFamily";
const KEY_TERMINAL_LETTER_SPACING = "terminalLetterSpacing";
const KEY_TERMINAL_FONT_SIZE = "terminalFontSize";
const KEY_TERMINAL_LINE_HEIGHT = "terminalLineHeight";
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
const KEY_KEEP_FOLDER_LAYOUT = "keepFolderLayoutOnChangeExplorerRoot";

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

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  themeId: DEFAULT_THEME_ID,
  editorTheme: "atomone",
  editorFontFamily: "",
  editorFontSize: EDITOR_FONT_SIZE_DEFAULT,
  editorLetterSpacing: LETTER_SPACING_DEFAULT,
  editorLineHeight: EDITOR_LINE_HEIGHT_DEFAULT,
  autostart: false,
  vimMode: false,
  showHidden: false,
  explorerGitColorScheme: "vscode",
  scmViewMode: "tree",
  terminalWebglEnabled: true,
  terminalCursorBlink: false,
  warnOnCloseTabWithRunningProcess: true,
  terminalFontFamily: "",
  terminalLetterSpacing: LETTER_SPACING_DEFAULT,
  terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
  terminalLineHeight: TERMINAL_LINE_HEIGHT_DEFAULT,
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
  panelSide: "left",
  tabBarStyle: "connected",
  workspacePaneLimit: 8,
  paneSplitLimit: { width: 250, height: 250 },
  keepFolderLayoutOnChangeExplorerRoot: false,
};

// Keybindings live in their own file so reassigning a shortcut never rewrites
// the (much larger) general settings, and vice versa.
const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });
const shortcutsStore = new LazyStore(SHORTCUTS_STORE_PATH, { defaults: {}, autoSave: 200 });

// LazyStore.onChange only fires within the writing process. The settings
// page lives in a separate webview, so writes there never reach the main
// window's subscribers. Mirror every setter through a Tauri event so any
// window can listen.
const PREFS_CHANGED_EVENT = "kex://prefs-changed";

export function parseScmViewMode(value: unknown): ScmViewMode {
  return value === "list" ? "list" : "tree";
}

async function writePref<T>(key: string, value: T): Promise<void> {
  await store.set(key, value);
  await store.save();
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
  const [entries, shortcutsValue] = await Promise.all([
    store.entries(),
    shortcutsStore.get<Record<ShortcutId, KeyBinding[]>>(KEY_SHORTCUTS),
  ]);
  const map = new Map<string, unknown>(entries);
  const get = <T>(k: string): T | undefined => map.get(k) as T | undefined;
  const result: Preferences = {
    theme: get<ThemePref>(KEY_THEME) ?? DEFAULT_PREFERENCES.theme,
    themeId: get<string>(KEY_THEME_ID) ?? DEFAULT_PREFERENCES.themeId,
    editorTheme:
      get<EditorThemeId>(KEY_EDITOR_THEME) ?? DEFAULT_PREFERENCES.editorTheme,
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
    scmViewMode: parseScmViewMode(get<string>(KEY_SCM_VIEW_MODE)),
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
    terminalLineHeight:
      get<number>(KEY_TERMINAL_LINE_HEIGHT) ??
      DEFAULT_PREFERENCES.terminalLineHeight,
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
    keepFolderLayoutOnChangeExplorerRoot:
      get<boolean>(KEY_KEEP_FOLDER_LAYOUT) ??
      DEFAULT_PREFERENCES.keepFolderLayoutOnChangeExplorerRoot,
  };

  // Persist any config keys that weren't present so they're discoverable in the JSON.
  const configDefaults: [string, unknown][] = [];
  if (!map.has(KEY_WORKSPACE_PANE_LIMIT)) configDefaults.push([KEY_WORKSPACE_PANE_LIMIT, DEFAULT_PREFERENCES.workspacePaneLimit]);
  if (!map.has(KEY_PANE_SPLIT_LIMIT)) configDefaults.push([KEY_PANE_SPLIT_LIMIT, DEFAULT_PREFERENCES.paneSplitLimit]);
  if (!map.has(KEY_KEEP_FOLDER_LAYOUT)) configDefaults.push([KEY_KEEP_FOLDER_LAYOUT, DEFAULT_PREFERENCES.keepFolderLayoutOnChangeExplorerRoot]);
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

export async function setVimMode(value: boolean): Promise<void> {
  await writePref(KEY_VIM_MODE, value);
}

export async function setShowHidden(value: boolean): Promise<void> {
  await writePref(KEY_SHOW_HIDDEN, value);
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

export async function setWarnOnCloseTabWithRunningProcess(value: boolean): Promise<void> {
  await writePref(KEY_WARN_ON_CLOSE_RUNNING, value);
}

export async function setTerminalFontFamily(value: string): Promise<void> {
  await writePref(KEY_TERMINAL_FONT_FAMILY, value.trim());
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
  await writeShortcutsPref(value);
}

export async function resetShortcuts(): Promise<void> {
  await writeShortcutsPref(DEFAULT_PREFERENCES.shortcuts);
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
  [KEY_EDITOR_FONT_FAMILY]: "editorFontFamily",
  [KEY_EDITOR_FONT_SIZE]: "editorFontSize",
  [KEY_EDITOR_LETTER_SPACING]: "editorLetterSpacing",
  [KEY_EDITOR_LINE_HEIGHT]: "editorLineHeight",
  [KEY_AUTOSTART]: "autostart",
  [KEY_VIM_MODE]: "vimMode",
  [KEY_SHOW_HIDDEN]: "showHidden",
  [KEY_EXPLORER_GIT_COLOR_SCHEME]: "explorerGitColorScheme",
  [KEY_SCM_VIEW_MODE]: "scmViewMode",
  [KEY_TERMINAL_WEBGL_ENABLED]: "terminalWebglEnabled",
  [KEY_TERMINAL_CURSOR_BLINK]: "terminalCursorBlink",
  [KEY_WARN_ON_CLOSE_RUNNING]: "warnOnCloseTabWithRunningProcess",
  [KEY_TERMINAL_FONT_FAMILY]: "terminalFontFamily",
  [KEY_TERMINAL_LETTER_SPACING]: "terminalLetterSpacing",
  [KEY_TERMINAL_FONT_SIZE]: "terminalFontSize",
  [KEY_TERMINAL_LINE_HEIGHT]: "terminalLineHeight",
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
    unsubShortcuts();
    unsubEvent();
  };
}
