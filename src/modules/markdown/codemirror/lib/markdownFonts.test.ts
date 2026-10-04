// @vitest-environment happy-dom

import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  buildLivePreviewExtensions,
  buildMarkdownBaseExtensions,
} from "@/modules/markdown/codemirror/lib/markdownExtensions";

function scrollerFont(extensions: Extension[]): string {
  const state = EditorState.create({ doc: "# Title", extensions });
  const view = new EditorView({ state, parent: document.body });
  const font = getComputedStyle(view.scrollDOM).fontFamily;
  view.destroy();
  return font;
}

describe("markdown editor fonts", () => {
  it("uses the sans font in Rich and the mono font in Source", () => {
    expect(scrollerFont(buildLivePreviewExtensions((s) => s))).not.toContain("mono");
    expect(scrollerFont(buildMarkdownBaseExtensions())).toContain("mono");
  });
});
