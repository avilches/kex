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
  it("forces the theme's url color to the foreground without touching the link tag", () => {
    const urlClass = plainUrlHighlight.style([tags.url]);
    expect(urlClass).toBeTruthy();
    expect(plainUrlHighlight.style([tags.link])).toBeNull();

    const state = EditorState.create({
      doc: "bare https://example.com here\n\nnext",
      selection: { anchor: 33 },
      extensions: buildLivePreviewExtensions((s) => s),
    });
    const view = new EditorView({ state, parent: document.body });
    // The URL is now a link, so its text sits in the link mark's span as well as
    // in the theme's url span; the latter must still carry the forced class.
    const spans = Array.from(view.dom.querySelectorAll("span")).filter(
      (s) => s.textContent === "https://example.com",
    );
    expect(spans.some((s) => s.className.split(" ").includes(urlClass ?? ""))).toBe(true);
    expect(spans.some((s) => s.classList.contains("cm-lp-link-text"))).toBe(true);
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
    const selector = [".cm-lp-heading", ".cm-lp-bold", ".cm-lp-italic", ".cm-lp-code", ".cm-lp-strike", ".cm-lp-link-text"];
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
  // theme color (typically blue) shows through instead of the text color.
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

  // A tagged fence is highlighted by nested spans inside its lines; a forced
  // foreground on `.cm-lp-codeblock *` would paint them all the same color.
  it("does not force a foreground color onto the highlighted spans inside a code block", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(rawCss).not.toContain("cm-lp-codeblock *");
    view.destroy();
  });

  it("does not stretch a table to the full width, and never italicizes a quote", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const table = /\.cm-lp-table \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(table).toContain("width: auto");
    expect(table).not.toContain("100%");
    const quoteLine = /\.cm-lp-quote-line \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(quoteLine).not.toContain("italic");
    expect(/\.cm-lp-quote \{[^}]*italic/.test(rawCss)).toBe(false);
    view.destroy();
  });

  it("forces the plain text color like the headings', and dims only H6", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(/\.cm-content \{[^}]*color: var\(--foreground\) !important/.test(rawCss)).toBe(true);
    const h6 = /\.cm-lp-h6, [^{]*\{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(h6).toContain("color-mix");
    // H5 is body-sized; H6 is smaller than body text.
    expect(/\.cm-lp-h5 \{[^}]*font-size: 1em/.test(rawCss)).toBe(true);
    expect(/\.cm-lp-h6 \{[^}]*font-size: 0\.85em/.test(rawCss)).toBe(true);
    view.destroy();
  });

  it("colors list markers and the bullet dot with the text color, not a tinted one", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(/\.cm-lp-bullet, [^{]*\{[^}]*color: var\(--foreground\) !important/.test(rawCss)).toBe(true);
    const dot = /\.cm-lp-bullet-dot::before \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(dot).toContain("background-color: var(--foreground)");
    view.destroy();
  });

  it("takes the code header out of the flow and gives fence lines no height, so they add no empty lines", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const header = /\.cm-lp-code-header \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(header).toContain("position: absolute");
    const fence = /\.cm-lp-fence-line \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(fence).toContain("height: 0");
    expect(fence).toContain("position: relative");
    const code = /\.cm-lp-codeblock \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(code).toContain("+ 14px");
    expect(code).toContain("padding-left: calc(var(--lp-code-left) + 14px)");
    view.destroy();
  });

  it("keeps the frontmatter plain: no heading bold, link underline or theme color", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const rule = /\.cm-lp-frontmatter, [^{]*\{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(rule).toContain("font-weight: normal !important");
    expect(rule).toContain("text-decoration: none !important");
    view.destroy();
  });

  it("draws a code block's band as a layer starting at its container's text, keeping a quote's bars", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const plain = /\.cm-lp-codeblock \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(plain).toContain("--lp-code-left: 0px");
    expect(plain).not.toContain("background-color");
    const quote = /\.cm-lp-codeblock\.cm-lp-quote-line \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(quote).toContain("repeating-linear-gradient");
    expect(quote).toContain("linear-gradient(color-mix");
    const list = /\.cm-lp-codeblock\.cm-lp-list-code \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(list).toContain("--lp-list-depth");
    // The list rule must come after the quote rule to win on a line that is both.
    expect(rawCss.indexOf(".cm-lp-codeblock.cm-lp-list-code")).toBeGreaterThan(
      rawCss.indexOf(".cm-lp-codeblock.cm-lp-quote-line"),
    );
    view.destroy();
  });

  it("shows the pointing hand over links only while the open-link modifier is held", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(/cm-lp-mod \.cm-lp-link-text[^{]*\{[^}]*cursor: pointer/.test(rawCss)).toBe(true);
    view.destroy();
  });

  it("moves a quote inside a list item to the item's text, both its bar and its padding", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const quoteLine = /\.cm-lp-quote-line \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(quoteLine.match(/--lp-quote-indent/g)?.length).toBeGreaterThanOrEqual(4);
    view.destroy();
  });

  it("keeps inline code upright even when the theme italicizes its nested span", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(/\.cm-lp-code, [^{]*\{[^}]*font-style: normal !important/.test(rawCss)).toBe(true);
    view.destroy();
  });

  it("draws the quote bar in a neutral color, starting where the text does", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const quoteLine = /\.cm-lp-quote-line \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(quoteLine).not.toContain("--primary");
    expect(quoteLine).toContain("--muted-foreground");
    expect(quoteLine).toContain("background-position: calc(6px + ");
    view.destroy();
  });

  it("lays an image out inline, so it stays beside the text of its line", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const rule = /\.cm-lp-image \{([^}]*)\}/.exec(rawCss)?.[1] ?? "";
    expect(rule).toContain("display: inline-block");
    expect(rule).not.toContain("display: block");
    view.destroy();
  });

  // Same specificity, so source order decides: the list rule must win to keep a
  // list's indentation inside a quote.
  it("keeps the list padding rule after the quote-line one in the stylesheet", () => {
    const state = EditorState.create({ doc: "", extensions: buildLivePreviewExtensions((s) => s) });
    const view = new EditorView({ state, parent: document.body });
    const rawCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const quoteRule = rawCss.indexOf(".cm-lp-quote-line {");
    const listRule = rawCss.indexOf(".cm-lp-list {");
    expect(quoteRule).toBeGreaterThanOrEqual(0);
    expect(listRule).toBeGreaterThan(quoteRule);
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
    const linkTextRuleIndex = rawCss.indexOf("var(--primary, #3b82f6) !important");
    expect(generalForegroundRuleIndex).toBeGreaterThanOrEqual(0);
    expect(linkTextRuleIndex).toBeGreaterThan(generalForegroundRuleIndex);
    view.destroy();
  });
});
