import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { lazyDecorationPlugin } from "@/modules/markdown/rich/extensions/lazyDecorationPlugin";

// Color swatch decorations: render a small filled square before every hex/rgb/hsl color
// literal (in normal text AND code blocks), VSCode-style. These are view-only widget
// decorations, so they never touch the document/markdown - the note stores only the plain
// color text and the swatch is re-derived on load.
const colorSwatchPluginKey = new PluginKey("colorSwatch");
const COLOR_LITERAL_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|(?:rgb|rgba|hsl|hsla)\([^)\n]{1,64}\)/g;

function makeColorSwatch(color: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "color-swatch";
  span.contentEditable = "false";
  span.style.backgroundColor = color;
  return span;
}

function buildColorSwatchDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text: string = node.text;
    COLOR_LITERAL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COLOR_LITERAL_RE.exec(text)) !== null) {
      const color = m[0];
      // Validate with the browser's own CSS parser so junk (rgb(foo), #12345) gets no swatch.
      if (!CSS.supports("color", color)) continue;
      const at = pos + m.index;
      decos.push(Decoration.widget(at, () => makeColorSwatch(color), { side: -1, key: `cs:${color}@${at}` }));
    }
  });
  return DecorationSet.create(doc, decos);
}

export const ColorSwatch = Extension.create({
  name: "colorSwatch",
  addProseMirrorPlugins() {
    return [lazyDecorationPlugin(colorSwatchPluginKey, buildColorSwatchDecorations)];
  },
});
