import type { EditorThemeId, EditorThemePref } from "@/modules/settings/store";
import { resolveEditorThemeId } from "./resolveEditorTheme";
import type { Theme } from "./types";

export const EDITOR_PREVIEW_SAMPLE = `// Debounce a function call
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  wait = 250,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const enabled = true;
console.log("ready", debounce.name, 42, enabled);
`;

/**
 * The editor theme the preview should render: the highlighted option while the
 * dropdown is open, otherwise the committed preference. "auto" resolves through
 * the active app theme, so the preview matches what the editor will really use.
 */
export function resolvePreviewThemeId(
  highlighted: EditorThemePref | null,
  committed: EditorThemePref,
  themeId: string,
  customThemes: Theme[],
  mode: "light" | "dark",
): EditorThemeId {
  return resolveEditorThemeId(highlighted ?? committed, themeId, customThemes, mode);
}
