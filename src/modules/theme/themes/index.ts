import { DEFAULT_THEME_ID, type Theme } from "../types";
import { caffeine } from "./caffeine";
import { catppuccin } from "./catppuccin";
import { claude } from "./claude";
import { dracula } from "./dracula";
import { everforest } from "./everforest";
import { ghosttyDefaultStyle } from "./ghostty-default-style";
import { gruvbox } from "./gruvbox";
import { kanagawa } from "./kanagawa";
import { kanagawaDragon } from "./kanagawa-dragon";
import { nord } from "./nord";
import { rosePine } from "./rose-pine";
import { sage } from "./sage";
import { solarized } from "./solarized";
import { jetbrainsClassic } from "./jetbrains-classic";
import { kexDefault } from "./kex-default";
import { tide } from "./tide";
import { tokyoNight } from "./tokyo-night";

const BUILTIN: Theme[] = [
  kexDefault,
  jetbrainsClassic,
  claude,
  kanagawa,
  kanagawaDragon,
  tokyoNight,
  catppuccin,
  rosePine,
  everforest,
  nord,
  gruvbox,
  dracula,
  solarized,
  tide,
  sage,
  caffeine,
];

// Palettes that carry only a terminal. They stay out of BUILTIN so they never
// show up as app themes; the terminal catalog adds them back.
const TERMINAL_ONLY: Theme[] = [ghosttyDefaultStyle];

const BY_ID = new Map<string, Theme>(BUILTIN.map((t) => [t.id, t]));

export function listBuiltinThemes(): Theme[] {
  return BUILTIN;
}

export function listTerminalOnlyThemes(): Theme[] {
  return TERMINAL_ONLY;
}

export function getBuiltinTheme(id: string): Theme | undefined {
  return BY_ID.get(id);
}

export function getDefaultTheme(): Theme {
  return BY_ID.get(DEFAULT_THEME_ID) ?? BUILTIN[0];
}
