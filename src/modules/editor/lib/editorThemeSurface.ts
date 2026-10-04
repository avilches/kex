import { EditorView } from "@codemirror/view";
import type { EditorSurface } from "@/modules/theme/types";
import { EDITOR_THEME_EXT } from "./themes";

const cache = new Map<string, EditorSurface>();

/**
 * Background and text color a CodeMirror theme paints on its own, read once
 * from a hidden view because the theme extensions do not expose them.
 */
export function readEditorThemeSurface(id: string): EditorSurface | undefined {
  const cached = cache.get(id);
  if (cached) return cached;
  const ext = EDITOR_THEME_EXT[id as keyof typeof EDITOR_THEME_EXT];
  if (!ext) return undefined;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;";
  document.body.appendChild(host);
  const view = new EditorView({ parent: host, extensions: [ext] });
  const cs = getComputedStyle(view.dom);
  const surface = { background: cs.backgroundColor, foreground: cs.color };
  view.destroy();
  host.remove();
  cache.set(id, surface);
  return surface;
}
