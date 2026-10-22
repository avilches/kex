// basicSetup is passed to @uiw/react-codemirror as a plain object; a new
// identity per render reconfigures every extension in the view. These
// module-level constants keep identity stable within their surface.
// searchKeymap stays off everywhere: the header search is the only search UI.
export const CM_MARKDOWN_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false,
  searchKeymap: false,
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
  searchKeymap: false,
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
  searchKeymap: false,
};

export const CM_DIFF_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false,
  searchKeymap: false,
};

export const CM_THEME_PREVIEW_SETUP = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  searchKeymap: false,
};
