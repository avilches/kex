export type EditorViewSettings = {
  wrap: boolean;
  lineNumbers: boolean;
  whitespace: boolean;
  foldGutter: boolean;
};

export type EditorViewMap = Record<string, Partial<EditorViewSettings>>;

const PROSE_EXTS = new Set(["md", "markdown", "mdx", "txt", "text"]);

const PROSE_DEFAULTS: EditorViewSettings = {
  wrap: true,
  lineNumbers: false,
  whitespace: false,
  foldGutter: false,
};

const CODE_DEFAULTS: EditorViewSettings = {
  wrap: false,
  lineNumbers: true,
  whitespace: false,
  foldGutter: true,
};

export function extOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function defaultsForExt(ext: string): EditorViewSettings {
  return PROSE_EXTS.has(ext) ? { ...PROSE_DEFAULTS } : { ...CODE_DEFAULTS };
}

export function resolveEditorView(
  path: string,
  map: EditorViewMap,
): EditorViewSettings {
  const ext = extOf(path);
  return { ...defaultsForExt(ext), ...(map[ext] ?? {}) };
}
