import { atomoneDarkStyle, defaultSettingsAtomone } from "@uiw/codemirror-theme-atomone";
import { auraDarkStyle, defaultSettingsAura } from "@uiw/codemirror-theme-aura";
import { copilotDarkStyle, defaultSettingsCopilot } from "@uiw/codemirror-theme-copilot";
import { darculaDarkStyle, defaultSettingsDarcula } from "@uiw/codemirror-theme-darcula";
import {
  defaultSettingsGithubDark,
  defaultSettingsGithubLight,
  githubDarkStyle,
  githubLightStyle,
} from "@uiw/codemirror-theme-github";
import { defaultSettingsGruvboxDark, gruvboxDarkStyle } from "@uiw/codemirror-theme-gruvbox-dark";
import { defaultSettingsNord, nordDarkStyle } from "@uiw/codemirror-theme-nord";
import { defaultSettingsTokyoNight, tokyoNightStyle } from "@uiw/codemirror-theme-tokyo-night";
import {
  defaultSettingsXcodeDark,
  defaultSettingsXcodeLight,
  xcodeDarkStyle,
  xcodeLightStyle,
} from "@uiw/codemirror-theme-xcode";
import { createTheme } from "@uiw/codemirror-themes";
import type { Extension } from "@codemirror/state";
import type { TagStyle } from "@codemirror/language";
import type { EditorThemeId } from "@/modules/settings/store";
import { listBuiltinThemes } from "@/modules/theme/themes";
import {
  catppuccinLatte,
  catppuccinMocha,
  dracula,
  everforestDark,
  everforestLight,
  kanagawa,
  kanagawaDragon,
  kanagawaLotus,
  rosePine,
  rosePineDawn,
  solarizedDark,
  solarizedLight,
} from "./cmThemes";
import { readableSpec, type CmThemeSpec } from "./readableSyntax";

const upstream = (
  theme: CmThemeSpec["theme"],
  settings: CmThemeSpec["settings"],
  styles: readonly unknown[],
): CmThemeSpec => ({ theme, settings, styles: styles as TagStyle[] });

const PALETTE: Record<EditorThemeId, CmThemeSpec> = {
  kanagawa,
  "kanagawa-lotus": kanagawaLotus,
  "kanagawa-dragon": kanagawaDragon,
  "tokyo-night": upstream("dark", defaultSettingsTokyoNight, tokyoNightStyle),
  "catppuccin-mocha": catppuccinMocha,
  "catppuccin-latte": catppuccinLatte,
  "rose-pine": rosePine,
  "rose-pine-dawn": rosePineDawn,
  everforest: everforestDark,
  "everforest-light": everforestLight,
  dracula,
  "solarized-dark": solarizedDark,
  "solarized-light": solarizedLight,
  nord: upstream("dark", defaultSettingsNord, nordDarkStyle),
  "gruvbox-dark": upstream("dark", defaultSettingsGruvboxDark, gruvboxDarkStyle),
  atomone: upstream("dark", defaultSettingsAtomone, atomoneDarkStyle),
  aura: upstream("dark", defaultSettingsAura, auraDarkStyle),
  copilot: upstream("dark", defaultSettingsCopilot, copilotDarkStyle),
  "github-dark": upstream("dark", defaultSettingsGithubDark, githubDarkStyle),
  "github-light": upstream("light", defaultSettingsGithubLight, githubLightStyle),
  "xcode-dark": upstream("dark", defaultSettingsXcodeDark, xcodeDarkStyle),
  "xcode-light": upstream("light", defaultSettingsXcodeLight, xcodeLightStyle),
  darcula: upstream("dark", defaultSettingsDarcula, darculaDarkStyle),
};

function pairedBackgrounds(id: string): string[] {
  return listBuiltinThemes().flatMap((t) =>
    (["dark", "light"] as const).flatMap((mode) => {
      const v = t.variants[mode];
      const bg = t.editorTheme?.[mode] === id ? (v?.editor?.background ?? v?.colors?.background) : undefined;
      return bg ? [bg] : [];
    }),
  );
}

// The upstream packages ship their palette as data; every syntax theme goes
// through the same contrast floor, on its own background and on the editor
// background of each app theme that pairs it.
export const EDITOR_THEME_SPEC = Object.fromEntries(
  Object.entries(PALETTE).map(([id, spec]) => [id, readableSpec(spec, pairedBackgrounds(id))]),
) as Record<EditorThemeId, CmThemeSpec>;

export const EDITOR_THEME_EXT = Object.fromEntries(
  Object.entries(EDITOR_THEME_SPEC).map(([id, spec]) => [id, createTheme(spec)]),
) as Record<EditorThemeId, Extension>;
