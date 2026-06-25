export type EditorViewSettings = {
  wrap: boolean;
  lineNumbers: boolean;
  whitespace: boolean;
  foldGutter: boolean;
  indentSize: number;
  indentWithTabs: boolean;
  columnRuler: number; // 0 = disabled
  spellCheck: boolean;
};

export type EditorViewMap = Record<string, Partial<EditorViewSettings>>;

export const EDITOR_INDENT_MIN = 1;
export const EDITOR_INDENT_MAX = 12;

export function clampIndentSize(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.min(EDITOR_INDENT_MAX, Math.max(EDITOR_INDENT_MIN, Math.round(n)));
}

// 0 = disabled. Below the minimum the guide draws right next to the gutter and
// reads as if the text overlapped the line numbers, so small columns are clamped up.
export const EDITOR_COLUMN_RULER_MIN = 4;
export const EDITOR_COLUMN_RULER_MAX = 500;

export function clampColumnRuler(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(
    EDITOR_COLUMN_RULER_MAX,
    Math.max(EDITOR_COLUMN_RULER_MIN, Math.round(n)),
  );
}

export const PROSE_DEFAULTS: EditorViewSettings = {
  wrap: true,
  lineNumbers: false,
  whitespace: false,
  foldGutter: false,
  indentSize: 4,
  indentWithTabs: false,
  columnRuler: 0,
  spellCheck: true,
};

export const CODE_DEFAULTS: EditorViewSettings = {
  wrap: false,
  lineNumbers: true,
  whitespace: false,
  foldGutter: true,
  indentSize: 4,
  indentWithTabs: false,
  columnRuler: 0,
  spellCheck: false,
};

export function extOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function resolveEditorView(
  path: string,
  map: EditorViewMap,
): EditorViewSettings {
  const ext = extOf(path);
  const entry = map[ext];
  const merged = entry
    ? { ...CODE_DEFAULTS, ...entry }
    : { ...CODE_DEFAULTS, ...(map["*"] ?? {}) };
  merged.columnRuler = clampColumnRuler(merged.columnRuler);
  return merged;
}
