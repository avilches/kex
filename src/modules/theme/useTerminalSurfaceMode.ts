import { usePreferencesStore } from "@/modules/settings/preferences";
import { useMemo } from "react";
import { colorMode } from "./noteSurface";
import { resolveTerminalPalette } from "./resolveTerminalTheme";
import { listBuiltinThemes, listTerminalOnlyThemes } from "./themes";
import { useTheme } from "./ThemeProvider";
import type { ThemeMode } from "./types";

/** The mode of the terminal surface, which can differ from the app's and the editor's. */
export function useTerminalSurfaceMode(): ThemeMode {
  const pref = usePreferencesStore((s) => s.terminalTheme);
  const { resolvedTheme, resolvedMode, customThemes } = useTheme();
  return useMemo(() => {
    const palette = resolveTerminalPalette(
      pref,
      resolvedTheme,
      [...listBuiltinThemes(), ...listTerminalOnlyThemes(), ...customThemes],
      resolvedMode,
    );
    return colorMode(palette?.background, resolvedMode);
  }, [pref, resolvedTheme, resolvedMode, customThemes]);
}
