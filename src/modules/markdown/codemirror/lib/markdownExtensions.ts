import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { codeLanguages } from "@/modules/markdown/codemirror/lib/codeLanguages";
import { linkClickHandler, livePreviewPlugin, staticPreview } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

// "codeblock" is left out on purpose: its lines carry the language highlighting
// of a tagged fence, and no theme colors the text of an untagged one.
const LP_FOREGROUND_CLASSES = ["heading", "bold", "italic", "strike", "code"];
const LP_TEXT_COLOR_SELECTORS = LP_FOREGROUND_CLASSES.flatMap((c) => [`.cm-lp-${c}`, `.cm-lp-${c} *`]).join(", ");

// Where the text of an item at list depth `depth` (a CSS number) starts, beyond
// the line's own 6px: its marker is about 1.5em wide plus 0.5em of indent, and
// each level below the first adds 1.3em, standing in for the raw spaces nested
// items are typed with. Used to line up whatever is nested inside a list item.
const itemTextIndent = (depth: string): string =>
  `(min(${depth}, 1) * 2em + max(${depth} - 1, 0) * 1.3em)`;

// One 3px bar per quote level, 16px apart, as a background layer tiled over
// `--lp-quote-depth * 16px`; and the flat band behind code, as a layer too.
const QUOTE_BARS =
  "repeating-linear-gradient(to right, color-mix(in srgb, var(--muted-foreground) 70%, transparent) 0 3px, transparent 3px 16px)";
// H6 is a dimmed heading on purpose; the share keeps it at 3:1 or more on every built-in theme (themes/contrast.test.ts).
export const H6_TEXT_SHARE = 0.75;
const CODE_BG = "color-mix(in srgb, var(--editor-foreground) 6%, transparent)";
const CODE_BAND = `linear-gradient(${CODE_BG}, ${CODE_BG})`;

// The user's code-syntax theme colors bare URLs arbitrarily; this engine does
// not decorate them, so they should read as plain text.
export const plainUrlHighlight = HighlightStyle.define([{ tag: tags.url, color: "var(--editor-foreground) !important" }]);

// GFM (tables, task lists, strikethrough) plus subscript/superscript/emoji: the
// `markdownLanguage` export already bundles these on top of CommonMark, so no
// manual @lezer/markdown extension list is needed.
export function buildMarkdownBaseExtensions(): Extension[] {
  return [
    markdown({ base: markdownLanguage, codeLanguages }),
    EditorView.lineWrapping,
    EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "var(--editor-background) !important",
        outline: "none",
        padding: "8px 16px",
      },
      ".cm-scroller": { fontFamily: "var(--font-mono, monospace)", fontSize: "13px", lineHeight: "1.6" },
      ".cm-content": { caretColor: "var(--editor-foreground)" },
    }),
  ];
}

export function buildLivePreviewExtensions(resolveImageSrc: (src: string) => string): Extension[] {
  return [...buildMarkdownBaseExtensions(), ...buildLiveDecorationExtensions(resolveImageSrc)];
}

// The read-only Preview mode: the Live Preview look with no line ever shown raw,
// where a plain click (not Cmd/Ctrl+click) opens a link.
export function buildStaticPreviewExtensions(resolveImageSrc: (src: string) => string): Extension[] {
  return [
    ...buildLivePreviewExtensions(resolveImageSrc),
    staticPreview.of(true),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.theme({ ".cm-lp-link-text, .cm-lp-link-text *": { cursor: "pointer" } }),
  ];
}

export function buildLiveDecorationExtensions(resolveImageSrc: (src: string) => string): Extension[] {
  return [
    syntaxHighlighting(plainUrlHighlight),
    livePreviewPlugin(resolveImageSrc),
    linkClickHandler,
    // The syntax highlighter nests its own colored span inside each lp span, and
    // an element's own color always beats an inherited one, so the color rules
    // also target descendants (`.cm-lp-x *`), with !important to beat the theme.
    // Prec.high: the base theme sets the scroller font too, and at equal
    // precedence the earlier extension wins, which kept Rich monospace.
    Prec.high(EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "var(--editor-background) !important",
        outline: "none",
        padding: "8px 16px",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-sans, inherit)",
        fontSize: "14px",
        lineHeight: "1.6",
      },
      // Plain text (and table cells, which inherit) takes the same color as the
      // headings; some editor themes would otherwise give it a dim foreground.
      ".cm-content": { caretColor: "var(--editor-foreground)", color: "var(--editor-foreground) !important" },
      ".cm-lp-heading": { fontWeight: "700" },
      ".cm-lp-h1": { fontSize: "1.85em" },
      ".cm-lp-h2": { fontSize: "1.6em" },
      ".cm-lp-h3": { fontSize: "1.35em" },
      ".cm-lp-h4": { fontSize: "1.15em" },
      // H5 is bold body text; H6 is bold, smaller and a little dimmer.
      ".cm-lp-h5": { fontSize: "1em" },
      ".cm-lp-h6": { fontSize: "0.85em" },
      // Line-level breathing room (em of the 14px line, not of the heading):
      // more above than below, so a heading sits closer to the text it introduces.
      ".cm-lp-hl1": { paddingTop: "0.9em", paddingBottom: "0.35em" },
      ".cm-lp-hl2": { paddingTop: "0.8em", paddingBottom: "0.3em" },
      ".cm-lp-hl3": { paddingTop: "0.7em", paddingBottom: "0.25em" },
      ".cm-lp-hl4, .cm-lp-hl5, .cm-lp-hl6": { paddingTop: "0.6em", paddingBottom: "0.2em" },
      ".cm-lp-bold": { fontWeight: "700" },
      ".cm-lp-italic": { fontStyle: "italic" },
      ".cm-lp-strike": { textDecoration: "line-through" },
      ".cm-lp-code": {
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "color-mix(in srgb, var(--editor-foreground) 8%, transparent)",
        fontSize: "0.9em",
        borderRadius: "3px",
        padding: "0.1em 0.4em",
      },
      // Some themes (Nord) italicize the `monospace` tag on a span nested inside.
      ".cm-lp-code, .cm-lp-code *": { fontStyle: "normal !important" },
      // Sub- and superscript shift with `position`, not `vertical-align`, so
      // they never change the height of their line.
      ".cm-lp-sub, .cm-lp-sup": { fontSize: "0.75em", position: "relative" },
      ".cm-lp-sub": { top: "0.35em" },
      ".cm-lp-sup": { top: "-0.45em" },
      ".cm-lp-link-text": { textDecoration: "underline" },
      // The hand shows only while the open-link modifier is held (a class the
      // plugin puts on the editor), since a plain click just places the cursor.
      "&.cm-lp-mod .cm-lp-link-text, &.cm-lp-mod .cm-lp-link-text *": { cursor: "pointer" },
      [LP_TEXT_COLOR_SELECTORS]: { color: "var(--editor-foreground) !important" },
      // After the rule above (same specificity), so H6 keeps its dimmer color.
      ".cm-lp-h6, .cm-lp-h6 *": { color: `color-mix(in srgb, var(--editor-foreground) ${H6_TEXT_SHARE * 100}%, transparent) !important` },
      // Same reason as LP_TEXT_COLOR_SELECTORS: the syntax highlighter's own
      // nested span (ordered-list digits, unordered-list dash/star/plus, or a
      // link inside a quote) otherwise sets its own color, beating this one.
      // The marker takes the text color: --muted-foreground reads as a tint of
      // its own in some app themes.
      ".cm-lp-bullet, .cm-lp-bullet *": { color: "var(--editor-foreground) !important" },
      ".cm-lp-quote, .cm-lp-quote *": { color: "var(--muted-foreground) !important" },
      // Same specificity as the two rules above, so it must come after them for
      // a link nested in bold, a heading, or a quote (or bold nested in a link)
      // to keep its color.
      ".cm-lp-link-text, .cm-lp-link-text *": { color: "var(--link, #3b82f6) !important" },
      // Brackets that turned out not to be a link (`[TODO]`, `[[Wiki Link]]`):
      // the syntax theme colors any Link node as a link, this puts it back.
      // A `[[Note]]` that names no note yet: a click creates it.
      ".cm-lp-wikilink-missing, .cm-lp-wikilink-missing *": {
        color: "var(--destructive) !important",
        textDecoration: "underline dashed",
      },
      ".cm-lp-notlink, .cm-lp-notlink *": { color: "var(--editor-foreground) !important", textDecoration: "none" },
      // The dot and the checkbox are both 20px wide (checkbox 16px + 4px
      // margin), so a task item's text lines up with a plain item's text.
      ".cm-lp-bullet-dot": { display: "inline-block", width: "20px", textAlign: "center" },
      ".cm-lp-bullet-dot::before": {
        content: '""',
        display: "inline-block",
        width: "0.5em",
        height: "0.5em",
        borderRadius: "50%",
        backgroundColor: "var(--editor-foreground)",
        verticalAlign: "middle",
      },
      ".cm-lp-checkbox": {
        appearance: "none",
        WebkitAppearance: "none",
        boxSizing: "border-box",
        width: "16px",
        height: "16px",
        margin: "0 4px 0 0",
        verticalAlign: "-3px",
        position: "relative",
        border: "2px solid var(--border)",
        borderRadius: "4px",
        background: "var(--background)",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      },
      ".cm-lp-checkbox:hover": { borderColor: "var(--primary)" },
      ".cm-lp-checkbox:checked": { background: "var(--primary)", borderColor: "var(--primary)" },
      ".cm-lp-checkbox:checked::after": {
        content: '""',
        position: "absolute",
        left: "3px",
        top: "0",
        width: "6px",
        height: "10px",
        border: "solid var(--primary-foreground)",
        borderWidth: "0 2px 2px 0",
        transform: "rotate(45deg)",
      },
      // A line decoration, so the bars run unbroken through wrapped and
      // consecutive lines: one 3px bar per nesting level, 16px apart, starting
      // at the 6px where the text of a plain line starts (not at the very edge).
      // A quote inside a list item (--lp-quote-indent items deep) starts at that
      // item's text instead of the margin.
      ".cm-lp-quote-line": {
        paddingLeft: `calc(var(--lp-quote-depth) * 16px + 6px + ${itemTextIndent("var(--lp-quote-indent, 0)")})`,
        backgroundImage: QUOTE_BARS,
        backgroundSize: "calc(var(--lp-quote-depth) * 16px) 100%",
        backgroundPosition: `calc(6px + ${itemTextIndent("var(--lp-quote-indent, 0)")}) 0`,
        backgroundRepeat: "no-repeat",
      },
      // After .cm-lp-quote-line, and adding the quote depth itself, so a list
      // inside a quote keeps both its bars and its indentation. Every item is
      // indented 0.5em from the surrounding text, and each nesting level adds
      // 0.75em on top of the raw spaces the item is typed with. The list levels
      // that lie outside a quote (--lp-quote-indent) were already spent moving
      // the quote, so only the levels inside it count here.
      ".cm-lp-list": {
        paddingLeft:
          "calc(var(--lp-quote-depth, 0) * 16px + 6px" +
          ` + ${itemTextIndent("var(--lp-quote-indent, 0)")}` +
          " + min(max(var(--lp-list-depth, 1) - var(--lp-quote-indent, 0), 0), 1) * 0.5em" +
          " + max(var(--lp-list-depth, 1) - var(--lp-quote-indent, 0) - 1, 0) * 0.75em)",
        paddingTop: "0.15em",
        paddingBottom: "0.15em",
      },
      ".cm-lp-hr": {
        display: "block",
        height: "0",
        margin: "0.5em 0",
        borderTop: "1px solid var(--border)",
      },
      // Inline, so an image typed in the middle of a sentence stays beside its text.
      ".cm-lp-image": {
        display: "inline-block",
        verticalAlign: "middle",
        maxWidth: "100%",
        borderRadius: "4px",
      },
      // What a failed image load leaves in its place: the alt text.
      ".cm-lp-image-broken": {
        color: "var(--muted-foreground)",
        border: "1px dashed var(--border)",
        borderRadius: "4px",
        padding: "0 6px",
        fontSize: "0.9em",
      },
      // A line decoration: each frontmatter line is as wide as the editor, so the
      // background reads as one block, and a blank line keeps the monospace height.
      ".cm-lp-frontmatter": {
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "color-mix(in srgb, var(--editor-foreground) 4%, transparent)",
      },
      // The parser still reads the frontmatter as markdown, so the theme paints
      // its closing `---` as a heading (bold) and a `[list]` as a link; it is
      // plain text here.
      ".cm-lp-frontmatter, .cm-lp-frontmatter *": {
        fontWeight: "normal !important",
        fontStyle: "normal !important",
        textDecoration: "none !important",
        color: "var(--editor-foreground) !important",
      },
      ".cm-lp-html": { fontFamily: "var(--font-mono, monospace)" },
      // A line decoration: one flat background on every line reads as one block.
      // The band is a background layer starting at --lp-code-left (where the
      // block's container puts its text), not the whole line's background, so a
      // block inside a list item or a quote is indented as a band, not just as
      // text, and a quote's bars can still show on the same line.
      ".cm-lp-codeblock": {
        fontFamily: "var(--font-mono, monospace)",
        position: "relative",
        "--lp-code-left": "0px",
        paddingLeft: "calc(var(--lp-code-left) + 14px)",
        backgroundImage: CODE_BAND,
        backgroundSize: "calc(100% - var(--lp-code-left)) 100%",
        backgroundPosition: "var(--lp-code-left) 0",
        backgroundRepeat: "no-repeat",
      },
      ".cm-lp-codeblock.cm-lp-quote-line": {
        "--lp-code-left": `calc(var(--lp-quote-depth) * 16px + 6px + ${itemTextIndent("var(--lp-quote-indent, 0)")})`,
        backgroundImage: `${QUOTE_BARS}, ${CODE_BAND}`,
        backgroundSize: "calc(var(--lp-quote-depth) * 16px) 100%, calc(100% - var(--lp-code-left)) 100%",
        backgroundPosition: `calc(6px + ${itemTextIndent("var(--lp-quote-indent, 0)")}) 0, var(--lp-code-left) 0`,
      },
      // Inside a list item, the band starts at the item's text. After the quote
      // rule, at the same specificity, so it wins when a line is both.
      ".cm-lp-codeblock.cm-lp-list-code": {
        "--lp-code-left": `calc(var(--lp-quote-depth, 0) * 16px + 6px + ${itemTextIndent("var(--lp-list-depth, 1)")})`,
      },
      // Code no language highlights: Nord and others italicize the `monospace` tag.
      ".cm-lp-code-plain, .cm-lp-code-plain *": { fontStyle: "normal !important" },
      // The block's own breathing room, in place of the fence lines.
      ".cm-lp-code-first": { paddingTop: "8px" },
      ".cm-lp-code-last": { paddingBottom: "8px" },
      // A rendered block's fence lines take no height: the header sits over the
      // first code line, the closing fence has nothing left to show.
      ".cm-lp-fence-line": { height: "0", padding: "0", overflow: "visible", lineHeight: "0", position: "relative" },
      // Language tag and copy button, over the top right corner of the block. Out
      // of the flow on purpose: a block-level widget inside a line splits it into
      // anonymous line boxes, and an inline one still takes its line's height.
      ".cm-lp-code-header": {
        position: "absolute",
        top: "4px",
        right: "8px",
        zIndex: "1",
        lineHeight: "1.4",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
      },
      ".cm-lp-code-lang": {
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "11px",
        color: "var(--muted-foreground)",
      },
      ".cm-lp-code-copy": {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 6px",
        borderRadius: "4px",
        border: "1px solid var(--border)",
        background: "transparent",
        color: "var(--muted-foreground)",
        cursor: "pointer",
        lineHeight: "0",
      },
      ".cm-lp-code-copy svg": { width: "1em", height: "1em" },
      ".cm-lp-code-copy:hover": { color: "var(--editor-foreground)", background: "var(--editor-background)" },
      ".cm-lp-code-copy.copied": {
        color: "var(--primary)",
        borderColor: "var(--primary)",
        background: "color-mix(in srgb, var(--primary) 12%, transparent)",
      },
      // Starts where a line's text does (its 6px padding), plus the indent of the
      // list item the table sits in, like the code blocks above.
      ".cm-lp-table-wrap": {
        overflowX: "auto",
        padding: "4px 0",
        marginLeft: `calc(6px + ${itemTextIndent("var(--lp-list-depth, 0)")})`,
      },
      // Shrink-to-fit: a small table is as wide as its content, a wide one is
      // capped by its wrapper, which scrolls.
      // CodeMirror's line wrapping sets `overflow-wrap: anywhere` on the content,
      // which the table inherits and which shrinks every column's minimum width
      // to one character; cells break at word boundaries only.
      ".cm-lp-table": {
        borderCollapse: "collapse",
        width: "auto",
        overflowWrap: "normal",
        wordBreak: "normal",
      },
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
    })),
  ];
}
