import { defaultMonoFontFamily } from "@/lib/fonts";
import type { CursorStyle } from "@/modules/settings/store";
import { bracketMatching, foldGutter, indentUnit } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { search } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  lineNumbers,
  scrollPastEnd,
} from "@codemirror/view";
import { clampColumnRuler, type EditorViewSettings } from "./editorViewSettings";
import { cursorBlinkExt, cursorStyleExt } from "./cursorExtensions";

// Compartments allow runtime reconfiguration without rebuilding state.
export const languageCompartment = new Compartment();
export const readOnlyCompartment = new Compartment();
export const wrapCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();
export const whitespaceCompartment = new Compartment();
export const foldGutterCompartment = new Compartment();
export const indentCompartment = new Compartment();
export const activeLineCompartment = new Compartment();
export const bracketMatchingCompartment = new Compartment();
export const closeBracketsCompartment = new Compartment();
export const autocompletionCompartment = new Compartment();
export const scrollPastEndCompartment = new Compartment();
export const cursorBlinkCompartment = new Compartment();
export const cursorStyleCompartment = new Compartment();
export const columnRulerCompartment = new Compartment();

export function indentExt(size: number, withTabs: boolean): Extension {
  const unit = withTabs ? "\t" : " ".repeat(size);
  return [indentUnit.of(unit), EditorState.tabSize.of(size)];
}

export function lineNumbersExt(on: boolean): Extension {
  return on ? [lineNumbers(), highlightActiveLineGutter()] : [];
}

export function columnRulerExt(col: number): Extension {
  const c = clampColumnRuler(col);
  if (c <= 0) return [];
  return EditorView.theme({
    ".cm-line": {
      backgroundImage: `linear-gradient(90deg, transparent calc(${c}ch), color-mix(in srgb, var(--muted-foreground) 30%, transparent) calc(${c}ch), color-mix(in srgb, var(--muted-foreground) 30%, transparent) calc(${c}ch + 1px), transparent calc(${c}ch + 1px))`,
    },
  });
}

export type SharedExtConfig = {
  view: EditorViewSettings;
  scrollPastEnd: boolean;
  highlightActiveLine: boolean;
  bracketMatching: boolean;
  closeBrackets: boolean;
  autocompletion: boolean;
  cursorBlink: boolean;
  cursorBlinkRate: number;
  cursorStyle: CursorStyle;
};

export function buildSharedExtensions(cfg: SharedExtConfig): Extension[] {
  return [
    indentCompartment.of(indentExt(cfg.view.indentSize, cfg.view.indentWithTabs)),
    search({ top: true }),
    lintGutter(),
    lineNumbersCompartment.of(lineNumbersExt(cfg.view.lineNumbers)),
    foldGutterCompartment.of(cfg.view.foldGutter ? foldGutter() : []),
    whitespaceCompartment.of(cfg.view.whitespace ? highlightWhitespace() : []),
    activeLineCompartment.of(cfg.highlightActiveLine ? highlightActiveLine() : []),
    bracketMatchingCompartment.of(cfg.bracketMatching ? bracketMatching() : []),
    closeBracketsCompartment.of(cfg.closeBrackets ? closeBrackets() : []),
    autocompletionCompartment.of(cfg.autocompletion ? autocompletion() : []),
    scrollPastEndCompartment.of(cfg.scrollPastEnd ? scrollPastEnd() : []),
    cursorBlinkCompartment.of(cursorBlinkExt(cfg.cursorBlink, cfg.cursorBlinkRate)),
    cursorStyleCompartment.of(cursorStyleExt(cfg.cursorStyle)),
    columnRulerCompartment.of(columnRulerExt(cfg.view.columnRuler)),
    EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "transparent !important",
        color: "var(--foreground)",
        outline: "none",
        padding: "8px",
        paddingRight: "0",
      },
      ".cm-scroller": {
        fontFamily: `var(--editor-font-family, ${defaultMonoFontFamily()})`,
        fontSize: "calc(var(--editor-font-size, 12px) * var(--app-zoom, 1))",
        letterSpacing: "var(--editor-letter-spacing, 0px)",
        lineHeight: "var(--editor-line-height, 1.5)",
        backgroundColor: "transparent !important",
      },
      ".cm-content": {
        caretColor: "var(--foreground)",
        backgroundColor: "transparent !important",
        paddingRight: "8px",
      },
      ".cm-gutters": {
        backgroundColor: "transparent !important",
        color: "var(--muted-foreground)",
      },
      ".cm-gutter-lint": {
        width: "0px",
      },
      ".cm-gutter": { backgroundColor: "transparent !important" },
      ".cm-lineNumbers .cm-gutterElement": {
        opacity: "0.55",
      },
      ".cm-foldGutter": { width: "10px" },
      ".cm-foldGutter .cm-gutterElement": {
        color: "var(--muted-foreground)",
        opacity: "0.5",
      },
      ".cm-activeLine": {
        borderTopRightRadius: "5px",
        borderBottomRightRadius: "5px",
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 4%, transparent)",
      },
      ".cm-lineNumbers .cm-activeLineGutter": {
        borderTopLeftRadius: "5px",
        borderBottomLeftRadius: "5px",
        userSelect: "none",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--foreground)",
      },
      // bracketMatching only recolors the glyph by default, which syntax
      // highlighting overrides; a background makes the match actually visible.
      ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 22%, transparent)",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 40%, transparent)",
        borderRadius: "2px",
      },
      ".cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": {
        backgroundColor:
          "color-mix(in srgb, var(--destructive, #f43f5e) 30%, transparent)",
        borderRadius: "2px",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
        {
          backgroundColor:
            "color-mix(in srgb, var(--foreground) 18%, transparent) !important",
        },
      ".cm-panels": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        borderColor: "var(--border)",
      },
    }),
  ];
}
