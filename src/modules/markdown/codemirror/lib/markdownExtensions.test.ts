// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import {
  buildLivePreviewExtensions,
  plainUrlHighlight,
} from "@/modules/markdown/codemirror/lib/markdownExtensions";

describe("buildLivePreviewExtensions", () => {
  it("styles a bare URL as plain text without touching the link tag", () => {
    const urlClass = plainUrlHighlight.style([tags.url]);
    expect(urlClass).toBeTruthy();
    expect(plainUrlHighlight.style([tags.link])).toBeNull();

    const state = EditorState.create({
      doc: "bare https://example.com here\n\nnext",
      selection: { anchor: 33 },
      extensions: buildLivePreviewExtensions(),
    });
    const view = new EditorView({ state, parent: document.body });
    const span = Array.from(view.dom.querySelectorAll("span")).find(
      (s) => s.textContent === "https://example.com",
    );
    expect(span?.className.split(" ")).toContain(urlClass);
    view.destroy();
  });
});
