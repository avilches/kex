import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTauriUnlisten } from "@/lib/useTauriListen";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  EDITOR_THEME_AUTO,
  onPreferencesChange,
  setTheme as persistTheme,
  setThemeId as persistThemeId,
  type ThemePref,
} from "@/modules/settings/store";
import { applyTheme } from "./applyTheme";
import { DEFAULT_THEME_ID } from "./types";
import {
  listCustomThemes,
  onCustomThemesChange,
} from "./customThemes";
import {
  getBuiltinTheme,
  getDefaultTheme,
  listBuiltinThemes,
  listTerminalOnlyThemes,
} from "./themes";
import { resolveEditorSurface } from "./resolveEditorSurface";
import { noteTintKey } from "./noteSurface";
import { resolveEditorThemeId } from "./resolveEditorTheme";
import { resolveTerminalPalette } from "./resolveTerminalTheme";
import type { EditorSurface, Theme } from "./types";

export type { Theme };

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultMode?: ThemePref;
};

type ThemeProviderState = {
  mode: ThemePref;
  resolvedMode: "dark" | "light";
  themeId: string;
  customThemes: Theme[];
  resolvedTheme: Theme;
  setMode: (mode: ThemePref) => void;
  setThemeId: (id: string) => void;
  /** Apply a theme transiently without persisting; null reverts to committed. */
  previewThemeId: (id: string | null) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

const FAST_PATH_KEY = "kex-ui-theme-shadow";
const FAST_PATH_THEME_ID = "kex-ui-theme-id-shadow";

function readFastMode(fallback: ThemePref): ThemePref {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(FAST_PATH_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : fallback;
}

function writeFastMode(t: ThemePref): void {
  try { window.localStorage.setItem(FAST_PATH_KEY, t); } catch { /* ignore */ }
}

function readFastThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  return window.localStorage.getItem(FAST_PATH_THEME_ID) ?? DEFAULT_THEME_ID;
}

function writeFastThemeId(id: string): void {
  try { window.localStorage.setItem(FAST_PATH_THEME_ID, id); } catch { /* ignore */ }
}

function resolveTheme(id: string, custom: Theme[]): Theme {
  return custom.find((t) => t.id === id) ?? getBuiltinTheme(id) ?? getDefaultTheme();
}

export function ThemeProvider({ children, defaultMode = "system" }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemePref>(() => readFastMode(defaultMode));
  const [themeId, setThemeIdState] = useState<string>(() => readFastThemeId());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  // usePreferencesStore's own init() (called once by App.tsx / SettingsApp.tsx)
  // already does the IPC load; reading it here instead of calling
  // loadPreferences() a second time halves the preference reads on startup.
  const storeTheme = usePreferencesStore((s) => s.theme);
  const storeThemeId = usePreferencesStore((s) => s.themeId);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  useEffect(() => {
    if (!prefsHydrated) return;
    setModeState(storeTheme);
    setThemeIdState(storeThemeId);
    writeFastMode(storeTheme);
    writeFastThemeId(storeThemeId);
  }, [prefsHydrated, storeTheme, storeThemeId]);

  useTauriUnlisten(
    () =>
      onPreferencesChange((key, value) => {
        if (key === "theme" && (value === "system" || value === "light" || value === "dark")) {
          setModeState(value);
          writeFastMode(value);
        } else if (key === "themeId" && typeof value === "string") {
          setThemeIdState(value);
          writeFastThemeId(value);
        }
      }),
    [],
  );

  useEffect(() => {
    let alive = true;
    void listCustomThemes().then((list) => { if (alive) setCustomThemes(list); });
    return () => {
      alive = false;
    };
  }, []);

  useTauriUnlisten(
    () =>
      onCustomThemesChange(() => {
        void listCustomThemes().then((list) => setCustomThemes(list));
      }),
    [],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedMode: "dark" | "light" =
    mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedMode);
  }, [resolvedMode]);

  const terminalThemePref = usePreferencesStore((s) => s.terminalTheme);
  const noteTints = usePreferencesStore((s) => s.noteTint);
  const editorPref = usePreferencesStore((s) => s.editorTheme);
  const editorThemePref =
    editorPref === EDITOR_THEME_AUTO
      ? EDITOR_THEME_AUTO
      : resolveEditorThemeId(editorPref, themeId, customThemes, resolvedMode);
  const effectiveId = previewId ?? themeId;
  const [editorSurface, setEditorSurface] = useState<EditorSurface | undefined>();
  useEffect(() => {
    if (editorThemePref === EDITOR_THEME_AUTO) {
      setEditorSurface(undefined);
      return;
    }
    let alive = true;
    void import("@/modules/editor/lib/editorThemeSurface").then((m) => {
      if (alive) setEditorSurface(m.readEditorThemeSurface(editorThemePref));
    });
    return () => {
      alive = false;
    };
  }, [editorThemePref]);
  useEffect(() => {
    const appTheme = resolveTheme(effectiveId, customThemes);
    const terminal = resolveTerminalPalette(
      terminalThemePref,
      appTheme,
      [...listBuiltinThemes(), ...listTerminalOnlyThemes(), ...customThemes],
      resolvedMode,
    );
    const editor =
      editorThemePref === EDITOR_THEME_AUTO
        ? resolveEditorSurface(editorThemePref, appTheme, resolvedMode, () => undefined)
        : editorSurface;
    applyTheme(appTheme, resolvedMode, terminal, editor, noteTints[noteTintKey(appTheme.id, resolvedMode)]);
  }, [effectiveId, resolvedMode, customThemes, terminalThemePref, editorThemePref, editorSurface, noteTints]);

  const setMode = useCallback((next: ThemePref) => {
    setModeState(next);
    writeFastMode(next);
    void persistTheme(next);
  }, []);

  const setThemeId = useCallback((id: string) => {
    setPreviewId(null);
    setThemeIdState(id);
    writeFastThemeId(id);
    void persistThemeId(id);
  }, []);

  const previewThemeId = useCallback((id: string | null) => {
    setPreviewId(id);
  }, []);

  const value = useMemo<ThemeProviderState>(
    () => ({
      mode,
      resolvedMode,
      themeId,
      customThemes,
      resolvedTheme: resolveTheme(previewId ?? themeId, customThemes),
      setMode,
      setThemeId,
      previewThemeId,
    }),
    [mode, resolvedMode, themeId, previewId, customThemes, setMode, setThemeId, previewThemeId],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  const ctx = useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
