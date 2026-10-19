// basicSetup is passed to @uiw/react-codemirror as a plain object; a new
// identity per render reconfigures every extension in the view. These
// module-level constants keep identity stable within their surface.
export const CM_MARKDOWN_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false,
};

export const CM_MARKDOWN_PREVIEW_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false,
  drawSelection: false,
};

export const CM_EDITOR_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false,
  highlightSelectionMatches: true,
  searchKeymap: true,
};

export const CM_DIFF_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false,
  searchKeymap: true,
};

export const CM_THEME_PREVIEW_SETUP = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
};
