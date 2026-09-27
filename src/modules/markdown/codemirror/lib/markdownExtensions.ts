import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { livePreviewPlugin } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

// The user's code-syntax theme colors bare URLs arbitrarily; this engine does
// not decorate them, so they should read as plain text.
export const plainUrlHighlight = HighlightStyle.define([{ tag: tags.url, color: "var(--foreground) !important" }]);

// GFM (tables, task lists, strikethrough) plus subscript/superscript/emoji: the
// `markdownLanguage` export already bundles these on top of CommonMark, so no
// manual @lezer/markdown extension list is needed. Tables parse without error
// but are not visually decorated in this version (see the design spec's scope).
export function buildLivePreviewExtensions(): Extension[] {
  return [
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(plainUrlHighlight),
    livePreviewPlugin,
    EditorView.lineWrapping,
    // `color: ... !important` on the lp classes: the user's code-syntax theme
    // colors the same markdown tokens with an equally specific class, so without
    // it the winner depends on stylesheet insertion order.
    EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "transparent !important",
        outline: "none",
        padding: "8px 16px",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-sans, inherit)",
        fontSize: "14px",
        lineHeight: "1.6",
      },
      ".cm-content": { caretColor: "var(--foreground)" },
      ".cm-lp-heading": { fontWeight: "700", color: "var(--foreground) !important" },
      ".cm-lp-h1": { fontSize: "1.6em" },
      ".cm-lp-h2": { fontSize: "1.4em" },
      ".cm-lp-h3": { fontSize: "1.2em" },
      ".cm-lp-h4, .cm-lp-h5, .cm-lp-h6": { fontSize: "1.05em" },
      ".cm-lp-bold": { fontWeight: "700", color: "var(--foreground) !important" },
      ".cm-lp-italic": { fontStyle: "italic", color: "var(--foreground) !important" },
      ".cm-lp-strike": { textDecoration: "line-through", color: "var(--foreground) !important" },
      ".cm-lp-code": {
        fontFamily: "var(--font-mono, monospace)",
        color: "var(--foreground) !important",
        backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)",
        borderRadius: "3px",
        padding: "0 3px",
      },
      ".cm-lp-link-text": { color: "var(--primary, #3b82f6) !important", textDecoration: "underline" },
      ".cm-lp-bullet": { color: "var(--muted-foreground)" },
      ".cm-lp-checkbox": { marginRight: "4px", cursor: "pointer" },
      ".cm-lp-frontmatter": {
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)",
      },
      ".cm-lp-html": { fontFamily: "var(--font-mono, monospace)" },
    }),
  ];
}
