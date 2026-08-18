import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";

export type NoteItem = {
  relPath: string;
  title: string;
  snippet: string;
  mtime: number;
  created: number;
};

export type SubfolderItem = {
  name: string;
  noteCount: number;
  hasSubfolders: boolean;
};

export type NotesDir = {
  folder: string;
  notes: NoteItem[];
  subfolders: SubfolderItem[];
  missing: boolean;
  error: string | null;
};

export type NoteHead = {
  relPath: string;
  title: string;
  snippet: string;
  missing: boolean;
};

export type PathKind = "file" | "dir" | "absent";

export type PathExists = { relPath: string; kind: PathKind };

export async function notesReadDirs(root: string, folders: string[]): Promise<NotesDir[]> {
  const res = await invoke<{ dirs: NotesDir[] }>("notes_read_dirs", {
    root,
    folders,
    workspace: currentWorkspaceEnv(),
  });
  return res.dirs;
}

export function notesReadHeads(root: string, relPaths: string[]): Promise<NoteHead[]> {
  return invoke<NoteHead[]>("notes_read_heads", {
    root,
    relPaths,
    workspace: currentWorkspaceEnv(),
  });
}

export function notesPathsExist(root: string, relPaths: string[]): Promise<PathExists[]> {
  return invoke<PathExists[]>("notes_paths_exist", {
    root,
    relPaths,
    workspace: currentWorkspaceEnv(),
  });
}
