export type NoteSortMode = "modified" | "title" | "created" | "custom";

export type NotesConfig = {
  quickAccess: string[];
  sortMode: NoteSortMode;
  noteOrder: Record<string, number>;
  collapsedFolders: string[];
  groupByDate: boolean;
  selectedFolder: string;
};

export const DEFAULT_NOTES_CONFIG: NotesConfig = {
  quickAccess: [],
  sortMode: "modified",
  noteOrder: {},
  collapsedFolders: [],
  groupByDate: true,
  selectedFolder: "",
};

const SORT_MODES: readonly string[] = ["modified", "title", "created", "custom"];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function parseNotesConfig(raw: string | null): NotesConfig {
  if (!raw) return { ...DEFAULT_NOTES_CONFIG };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_NOTES_CONFIG };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_NOTES_CONFIG };
  }
  const ns = (parsed as Record<string, unknown>).notes;
  if (typeof ns !== "object" || ns === null || Array.isArray(ns)) {
    return { ...DEFAULT_NOTES_CONFIG };
  }
  const n = ns as Record<string, unknown>;
  const noteOrder: Record<string, number> = {};
  if (typeof n.noteOrder === "object" && n.noteOrder !== null && !Array.isArray(n.noteOrder)) {
    for (const [k, v] of Object.entries(n.noteOrder as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) noteOrder[k] = v;
    }
  }
  return {
    quickAccess: isStringArray(n.quickAccess) ? n.quickAccess : [],
    sortMode: SORT_MODES.includes(n.sortMode as string)
      ? (n.sortMode as NoteSortMode)
      : DEFAULT_NOTES_CONFIG.sortMode,
    noteOrder,
    collapsedFolders: isStringArray(n.collapsedFolders) ? n.collapsedFolders : [],
    groupByDate:
      typeof n.groupByDate === "boolean" ? n.groupByDate : DEFAULT_NOTES_CONFIG.groupByDate,
    selectedFolder: typeof n.selectedFolder === "string" ? n.selectedFolder : "",
  };
}

export function serializeNotesConfig(raw: string | null, config: NotesConfig): string {
  let root: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        root = parsed as Record<string, unknown>;
      }
    } catch {
      // invalid file: the first user mutation legitimately replaces it (spec, Error handling)
    }
  }
  root.notes = config;
  return `${JSON.stringify(root, null, 2)}\n`;
}

export function renamePathInConfig(config: NotesConfig, from: string, to: string): NotesConfig {
  const map = (p: string): string =>
    p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p;
  const noteOrder: Record<string, number> = {};
  for (const [k, v] of Object.entries(config.noteOrder)) noteOrder[map(k)] = v;
  return {
    ...config,
    quickAccess: config.quickAccess.map(map),
    noteOrder,
    collapsedFolders: config.collapsedFolders.map(map),
    selectedFolder: map(config.selectedFolder),
  };
}

export function deletePathInConfig(config: NotesConfig, relPath: string): NotesConfig {
  const gone = (p: string): boolean => p === relPath || p.startsWith(`${relPath}/`);
  const noteOrder: Record<string, number> = {};
  for (const [k, v] of Object.entries(config.noteOrder)) {
    if (!gone(k)) noteOrder[k] = v;
  }
  return {
    ...config,
    quickAccess: config.quickAccess.filter((p) => !gone(p)),
    noteOrder,
    collapsedFolders: config.collapsedFolders.filter((p) => !gone(p)),
    selectedFolder: gone(config.selectedFolder) ? "" : config.selectedFolder,
  };
}
