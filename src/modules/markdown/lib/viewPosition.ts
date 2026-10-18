// Where the reader was in a markdown document, in lines of the source text, so
// it survives a switch between views that do not share one CodeMirror state.
export type ViewPosition = {
  // 1-based line and 0-based column of the cursor.
  cursorLine: number;
  cursorCol: number;
  // 1-based line shown at the top of the viewport.
  topLine: number;
};

// Coming back from Preview, where there is no cursor: if the reader did not
// scroll there, the old cursor and scroll are exact; if they did, the cursor
// goes to the top of what they were reading.
export function positionAfterPreview(saved: ViewPosition | null, previewTopLine: number): ViewPosition {
  if (saved && saved.topLine === previewTopLine) return saved;
  return { cursorLine: previewTopLine, cursorCol: 0, topLine: previewTopLine };
}
