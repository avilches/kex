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
      extensions: buildLivePreviewExtensions((s) => s),
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
      extensions: [githubDark, ...buildLivePreviewExtensions((s) => s)],
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

  // Same technique as the test above, isolated to the list-marker bug: the
  // syntax theme colors an ordered digit and an unordered dash/star/plus, and
  // without a `!important` override targeting their nested span too, that
  // theme color (typically blue) shows through instead of muted-foreground.
  // An inactive unordered marker is replaced outright by the bullet-dot
  // widget (a separate, untinted element), so this only needs to cover the
  // raw-text cases: an ordered marker (always raw) and an unordered marker on
  // its own active line (also raw, to allow editing it).
  it("gives an ordered and an active unordered list marker their own !important color, under a coloring theme", () => {
    const doc = "1. one\n\n- two\n";
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.indexOf("two") },
      extensions: [githubDark, ...buildLivePreviewExtensions((s) => s)],
    });
    const view = new EditorView({ state, parent: document.body });
    forceParsing(view, doc.length, 5000);
    const importantColorSelectors = Array.from(document.querySelectorAll("style"))
      .flatMap((style) => (style.textContent ?? "").split("}"))
      .map((rule) => rule.split("{"))
      .filter(([, body]) => body !== undefined && /(^|[;\s])color:[^;]*!important/.test(body))
      .map(([selectors]) => selectors.trim());
    const ownImportantColor = (el: Element) => importantColorSelectors.some((sel) => el.matches(sel));
    const markers = Array.from(view.dom.querySelectorAll(".cm-lp-bullet"));
    expect(markers.length).toBe(2);
    for (const outer of markers) {
      for (const el of [outer, ...Array.from(outer.querySelectorAll("*"))]) {
        expect(ownImportantColor(el), `${outer.textContent} > ${el.tagName}.${el.className}`).toBe(true);
      }
    }
    view.destroy();
  });

  // The general foreground rule and the link-text rule carry the same
  // selector specificity, so only source order decides which color wins for
  // a link nested inside bold text or a heading. Matching some !important
  // color rule (the test above) isn't enough to catch a reorder; this checks
  // the link rule specifically comes after the general one in the raw text.
  it("keeps the link-text color rule after the general foreground rule in the stylesheet", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const generalForegroundRuleIndex = rawCss.indexOf("cm-lp-heading, ");
    const linkTextRuleIndex = rawCss.indexOf("cm-lp-link-text, ");
    expect(generalForegroundRuleIndex).toBeGreaterThanOrEqual(0);
    expect(linkTextRuleIndex).toBeGreaterThan(generalForegroundRuleIndex);
    view.destroy();
  });
});
