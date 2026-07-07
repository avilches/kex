import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";

export type NoteListItem = {
  path: string;
  relPath: string;
  title: string;
  mtime: number;
  created: number;
  snippet: string;
  folder: string;
};

export type NotesListResult = {
  notes: NoteListItem[];
  folders: string[];
  truncated: boolean;
};

export function notesList(root: string): Promise<NotesListResult> {
  return invoke<NotesListResult>("notes_list", {
    root,
    workspace: currentWorkspaceEnv(),
  });
}
