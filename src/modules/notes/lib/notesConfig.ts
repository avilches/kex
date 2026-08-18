import { ancestorsOf, splitPath } from "@/lib/pathUtils";
import type { PathKind } from "./notesDir";

export type NoteSortMode = "modified" | "title" | "created" | "custom";

export type NotesConfig = {
  quickAccess: string[];
  sortMode: NoteSortMode;
  folderOrder: Record<string, string[]>;
  expandedFolders: string[];
  groupByDate: boolean;
  selectedFolder: string;
};

export const DEFAULT_NOTES_CONFIG: NotesConfig = {
  quickAccess: [],
  sortMode: "modified",
  folderOrder: {},
  expandedFolders: [],
  groupByDate: true,
  selectedFolder: "",
};

const SORT_MODES: readonly string[] = ["modified", "title", "created", "custom"];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// kex.json is user-editable and its paths are concatenated onto the vault root,
// so a traversal or an absolute path here would reach outside the vault.
function isSafeVaultPath(p: string): boolean {
  if (p.startsWith("/") || p.includes("\\")) return false;
  if (/^[A-Za-z]:[/\\]/.test(p)) return false;
  return !p.split("/").some((seg) => seg === "..");
}

export function withAncestors(expanded: string[], folder: string): string[] {
  const missing = ancestorsOf(folder).filter((a) => !expanded.includes(a));
  return missing.length === 0 ? expanded : [...expanded, ...missing];
}

export function parseNotesConfig(raw: string | null): NotesConfig {
  if (!raw) return { ...DEFAULT_NOTES_CONFIG };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_NOTES_CONFIG };
  }
  if (!isPlainObject(parsed)) return { ...DEFAULT_NOTES_CONFIG };
  const ns = parsed.notes;
  if (!isPlainObject(ns)) return { ...DEFAULT_NOTES_CONFIG };
  const folderOrder: Record<string, string[]> = {};
  if (isPlainObject(ns.folderOrder)) {
    for (const [k, v] of Object.entries(ns.folderOrder)) {
      if (isSafeVaultPath(k) && isStringArray(v)) folderOrder[k] = v;
    }
  }
  const selectedFolder =
    typeof ns.selectedFolder === "string" && isSafeVaultPath(ns.selectedFolder)
      ? ns.selectedFolder
      : "";
  const expandedFolders = isStringArray(ns.expandedFolders)
    ? ns.expandedFolders.filter(isSafeVaultPath)
    : [];
  return {
    quickAccess: isStringArray(ns.quickAccess)
      ? ns.quickAccess.filter(isSafeVaultPath)
      : [],
    sortMode: SORT_MODES.includes(ns.sortMode as string)
      ? (ns.sortMode as NoteSortMode)
      : DEFAULT_NOTES_CONFIG.sortMode,
    folderOrder,
    expandedFolders: withAncestors(expandedFolders, selectedFolder),
    groupByDate:
      typeof ns.groupByDate === "boolean" ? ns.groupByDate : DEFAULT_NOTES_CONFIG.groupByDate,
    selectedFolder,
  };
}

export function serializeNotesConfig(raw: string | null, config: NotesConfig): string {
  let root: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) root = parsed;
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
  // A note rename only ever touches the list of its own folder. A folder rename
  // cannot collide here: the filesystem forbids a note and a folder sharing a name.
  const [fromDir, fromName] = splitPath(from);
  const [toDir, toName] = splitPath(to);
  const folderOrder: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    const next =
      folder !== fromDir
        ? names
        : toDir === fromDir
          ? names.map((x) => (x === fromName ? toName : x))
          : names.filter((x) => x !== fromName);
    if (next.length > 0) folderOrder[map(folder)] = next;
  }
  return {
    ...config,
    quickAccess: config.quickAccess.map(map),
    folderOrder,
    expandedFolders: config.expandedFolders.map(map),
    selectedFolder: map(config.selectedFolder),
  };
}

export function deletePathInConfig(config: NotesConfig, relPath: string): NotesConfig {
  const gone = (p: string): boolean => p === relPath || p.startsWith(`${relPath}/`);
  const [dir, name] = splitPath(relPath);
  const folderOrder: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    if (gone(folder)) continue;
    const next = folder === dir ? names.filter((x) => x !== name) : names;
    if (next.length > 0) folderOrder[folder] = next;
  }
  return {
    ...config,
    quickAccess: config.quickAccess.filter((p) => !gone(p)),
    folderOrder,
    expandedFolders: config.expandedFolders.filter((p) => !gone(p)),
    selectedFolder: gone(config.selectedFolder) ? "" : config.selectedFolder,
  };
}

export function pathsToCheck(config: NotesConfig): string[] {
  const out = new Set<string>(config.expandedFolders);
  if (config.selectedFolder !== "") out.add(config.selectedFolder);
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    out.add(folder);
    for (const name of names) out.add(folder === "" ? name : `${folder}/${name}`);
  }
  return [...out];
}

function sameFolderOrder(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return y !== undefined && x.length === y.length && x.every((v, i) => v === y[i]);
  });
}

export function pruneNotesConfig(
  config: NotesConfig,
  kinds: Map<string, PathKind>,
): NotesConfig {
  // A path the answer does not mention was never asked about, so it stays.
  const isDir = (p: string): boolean => p === "" || (kinds.get(p) ?? "dir") === "dir";
  const isFile = (p: string): boolean => (kinds.get(p) ?? "file") === "file";

  const expandedFolders = config.expandedFolders.filter(isDir);
  const folderOrder: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    if (!isDir(folder)) continue;
    const next = names.filter((name) =>
      isFile(folder === "" ? name : `${folder}/${name}`),
    );
    if (next.length > 0) folderOrder[folder] = next;
  }
  const selectedFolder = isDir(config.selectedFolder) ? config.selectedFolder : "";

  const changed =
    expandedFolders.length !== config.expandedFolders.length ||
    selectedFolder !== config.selectedFolder ||
    !sameFolderOrder(folderOrder, config.folderOrder);
  return changed ? { ...config, expandedFolders, folderOrder, selectedFolder } : config;
}
