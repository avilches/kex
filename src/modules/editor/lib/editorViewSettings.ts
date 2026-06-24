export type EditorViewSettings = {
  wrap: boolean;
  lineNumbers: boolean;
  whitespace: boolean;
  foldGutter: boolean;
  indentSize: number;
  indentWithTabs: boolean;
};

export type EditorViewMap = Record<string, Partial<EditorViewSettings>>;

export const EDITOR_INDENT_MIN = 1;
export const EDITOR_INDENT_MAX = 12;

export function clampIndentSize(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.min(EDITOR_INDENT_MAX, Math.max(EDITOR_INDENT_MIN, Math.round(n)));
}

export const PROSE_EXTS = new Set(["md", "markdown", "mdx", "txt", "text"]);

export const PROSE_DEFAULTS: EditorViewSettings = {
  wrap: true,
  lineNumbers: false,
  whitespace: false,
  foldGutter: false,
  indentSize: 4,
  indentWithTabs: false,
};

export const CODE_DEFAULTS: EditorViewSettings = {
  wrap: false,
  lineNumbers: true,
  whitespace: false,
  foldGutter: true,
  indentSize: 4,
  indentWithTabs: false,
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

export function normalizeExtKey(exts: string[]): string {
  return exts
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join(",");
}

export function findKeyForExt(ext: string, map: EditorViewMap): string | null {
  let bestKey: string | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const key of Object.keys(map)) {
    if (key === "*") continue;
    const parts = key.split(",");
    if (parts.includes(ext) && parts.length < bestCount) {
      bestKey = key;
      bestCount = parts.length;
    }
  }
  return bestKey;
}

export function resolveEditorView(
  path: string,
  map: EditorViewMap,
): EditorViewSettings {
  const ext = extOf(path);
  const bestKey = findKeyForExt(ext, map);
  const base = defaultsForExt(ext);
  const overlay = bestKey != null ? (map[bestKey] ?? {}) : (map["*"] ?? {});
  return { ...base, ...overlay };
}
