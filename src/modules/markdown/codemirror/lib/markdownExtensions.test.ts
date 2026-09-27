// @vitest-environment happy-dom
import { forceParsing } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { githubDark } from "@uiw/codemirror-theme-github";
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

  // The syntax highlighter nests its own colored span inside each lp span, so a
  // color on the lp span alone never reaches the text. happy-dom's
  // getComputedStyle wrongly lets an inherited !important beat the inner span's
  // own color, and its CSS parser drops `var(--x, fallback) !important`, so this
  // reads the raw injected stylesheet text: every element holding lp text must
  // itself match a rule that sets color with !important.
  it("gives every element inside an lp span its own !important color, under a coloring theme", () => {
    const doc = "# Title\n\n**bold** _italic_ `code` ~~gone~~ [link](https://x.com)\n\n```js\nconst x = 1;\n```\n\nend\n";
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [githubDark, ...buildLivePreviewExtensions()],
    });
    const view = new EditorView({ state, parent: document.body });
    forceParsing(view, doc.length, 5000);
    const importantColorSelectors = Array.from(document.querySelectorAll("style"))
      .flatMap((style) => (style.textContent ?? "").split("}"))
      .map((rule) => rule.split("{"))
      .filter(([, body]) => body !== undefined && /(^|[;\s])color:[^;]*!important/.test(body))
      .map(([selectors]) => selectors.trim());
    const ownImportantColor = (el: Element) => importantColorSelectors.some((sel) => el.matches(sel));
    const selector = [".cm-lp-heading", ".cm-lp-bold", ".cm-lp-italic", ".cm-lp-code", ".cm-lp-strike", ".cm-lp-link-text", ".cm-lp-codeblock"];
    const covered = new Set<string>();
    for (const outer of Array.from(view.dom.querySelectorAll(selector.join(", ")))) {
      const nested = Array.from(outer.querySelectorAll("*"));
      for (const el of [outer, ...nested]) {
        expect(ownImportantColor(el), `${outer.className} > ${el.className}`).toBe(true);
      }
      if (nested.length > 0) covered.add(selector.find((s) => outer.matches(s)) ?? "");
    }
    // The theme really did nest its spans inside ours, or this test proves nothing.
    expect(covered).toContain(".cm-lp-heading");
    expect(covered).toContain(".cm-lp-bold");
    expect(covered).toContain(".cm-lp-italic");
    view.destroy();
  });
});
