import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { linkClickHandler, livePreviewPlugin } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

// The user's code-syntax theme colors bare URLs arbitrarily; this engine does
// not decorate them, so they should read as plain text.
const LP_FOREGROUND_CLASSES = ["heading", "bold", "italic", "strike", "code", "codeblock"];
const LP_TEXT_COLOR_SELECTORS = LP_FOREGROUND_CLASSES.flatMap((c) => [`.cm-lp-${c}`, `.cm-lp-${c} *`]).join(", ");

export const plainUrlHighlight = HighlightStyle.define([{ tag: tags.url, color: "var(--foreground) !important" }]);

// GFM (tables, task lists, strikethrough) plus subscript/superscript/emoji: the
// `markdownLanguage` export already bundles these on top of CommonMark, so no
// manual @lezer/markdown extension list is needed.
export function buildLivePreviewExtensions(): Extension[] {
  return [
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(plainUrlHighlight),
    livePreviewPlugin,
    linkClickHandler,
    EditorView.lineWrapping,
    // The syntax highlighter nests its own colored span inside each lp span, and
    // an element's own color always beats an inherited one, so the color rules
    // also target descendants (`.cm-lp-x *`), with !important to beat the theme.
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
      ".cm-lp-heading": { fontWeight: "700" },
      ".cm-lp-h1": { fontSize: "1.6em" },
      ".cm-lp-h2": { fontSize: "1.4em" },
      ".cm-lp-h3": { fontSize: "1.2em" },
      ".cm-lp-h4, .cm-lp-h5, .cm-lp-h6": { fontSize: "1.05em" },
      ".cm-lp-bold": { fontWeight: "700" },
      ".cm-lp-italic": { fontStyle: "italic" },
      ".cm-lp-strike": { textDecoration: "line-through" },
      ".cm-lp-code": {
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)",
        borderRadius: "3px",
        padding: "0 3px",
      },
      ".cm-lp-link-text": { textDecoration: "underline" },
      [LP_TEXT_COLOR_SELECTORS]: { color: "var(--foreground) !important" },
      ".cm-lp-link-text, .cm-lp-link-text *": { color: "var(--primary, #3b82f6) !important" },
      ".cm-lp-bullet": { color: "var(--muted-foreground)" },
      ".cm-lp-checkbox": { marginRight: "4px", cursor: "pointer" },
      ".cm-lp-frontmatter": {
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)",
      },
      ".cm-lp-html": { fontFamily: "var(--font-mono, monospace)" },
      ".cm-lp-codeblock": {
        display: "inline-block",
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "color-mix(in srgb, var(--foreground) 6%, transparent)",
        borderRadius: "4px",
        padding: "2px 0",
      },
      // Matches the TipTap engine's table styling (richMarkdown.css).
      ".cm-lp-table-wrap": { overflowX: "auto", padding: "4px 0" },
      ".cm-lp-table": { borderCollapse: "collapse", width: "100%" },
      ".cm-lp-table th, .cm-lp-table td": {
        border: "1px solid var(--border)",
        padding: "6px 12px",
        textAlign: "left",
        verticalAlign: "top",
      },
      ".cm-lp-table th": {
        backgroundColor: "color-mix(in srgb, var(--muted) 50%, transparent)",
        fontWeight: "600",
      },
      ".cm-lp-table a": { cursor: "pointer" },
    }),
  ];
}
