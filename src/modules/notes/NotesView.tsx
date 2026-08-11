import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { native } from "@/lib/native";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CollectionsColumn } from "./CollectionsColumn";
import { nextFolderName } from "./lib/folderTree";
import { filterByFolder, nextUntitledName } from "./lib/noteSort";
import type { NoteListItem } from "./lib/notesList";
import { useNotesIndex } from "./lib/useNotesIndex";
import { useNotesState } from "./lib/useNotesState";
import { NoteListColumn } from "./NoteListColumn";

export type NotesViewProps = {
  root: string;
  active: boolean;
  onOpenFile: (path: string, pin?: boolean) => void;
  onOpenToSide: (path: string) => void;
  onRevealInExplorer: (path: string) => void;
  onPathRenamed: (from: string, to: string) => void;
  onPathDeleted: (path: string) => void;
};

export function NotesView(props: NotesViewProps) {
  const canonRoot = props.root.replace(/\\/g, "/").replace(/\/+$/, "");
  const state = useNotesState(canonRoot, props.active);
  const index = useNotesIndex(canonRoot, props.active);
  const [primedRenamePath, setPrimedRenamePath] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: props.active and canonRoot are reset triggers, not read in the body
  useEffect(() => {
    // The delete confirmation is an AlertDialog rendered through a Radix
    // Portal, so it escapes the sidebar's invisible/pointer-events-none hide
    // pattern and would float over whatever view the user switches to. A
    // workspace switch changes canonRoot without deactivating the view (the
    // sidebar chrome is per-window, not per-workspace), so per-vault local
    // state must also reset on root change or it leaks across vaults.
    setPendingDelete(null);
    setEditingFolder(null);
    setPrimedRenamePath(null);
  }, [props.active, canonRoot]);

  const abs = useCallback(
    (relPath: string) => `${canonRoot}/${relPath}`,
    [canonRoot],
  );
  const notesByRelPath = useMemo(() => {
    const map = new Map<string, NoteListItem>();
    for (const n of index.notes) map.set(n.relPath, n);
    return map;
  }, [index.notes]);
  const visibleNotes = useMemo(
    () => filterByFolder(index.notes, state.config.selectedFolder),
    [index.notes, state.config.selectedFolder],
  );

  const openRel = useCallback(
    (relPath: string, pin?: boolean) => props.onOpenFile(abs(relPath), pin),
    [abs, props.onOpenFile],
  );

  const handleNewNoteIn = useCallback(
    async (folder: string) => {
      const siblings = index.notes
        .filter((n) => n.folder === folder)
        .map((n) => n.relPath.split("/").pop() ?? "");
      const name = nextUntitledName(siblings);
      const relPath = folder === "" ? name : `${folder}/${name}`;
      try {
        await native.createFile(abs(relPath));
        setPrimedRenamePath(relPath);
        props.onOpenFile(abs(relPath), true);
        index.refresh();
      } catch (e) {
        toast.error(`Could not create note: ${e}`);
      }
    },
    [index, abs, props.onOpenFile],
  );

  const handleNewFolder = useCallback(
    async (parent: string) => {
      const siblings = index.folders
        .filter((f) =>
          parent === ""
            ? !f.includes("/")
            : f.startsWith(`${parent}/`) && !f.slice(parent.length + 1).includes("/"),
        )
        .map((f) => f.split("/").pop() ?? "");
      const name = nextFolderName(siblings);
      const relPath = parent === "" ? name : `${parent}/${name}`;
      try {
        await native.createDir(abs(relPath));
        setEditingFolder(relPath);
        index.refresh();
      } catch (e) {
        toast.error(`Could not create folder: ${e}`);
      }
    },
    [index, abs],
  );

  const handleRenameFolder = useCallback(
    async (relPath: string, newName: string) => {
      const dir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
      const newRel = dir === "" ? newName : `${dir}/${newName}`;
      if (newRel === relPath) return;
      try {
        await native.renameFile(abs(relPath), abs(newRel));
        state.notePathRenamed(relPath, newRel);
        props.onPathRenamed(abs(relPath), abs(newRel));
        index.refresh();
      } catch (e) {
        toast.error(`Could not rename folder: ${e}`);
        index.refresh();
      }
    },
    [abs, state, index, props.onPathRenamed],
  );

  const handleRename = useCallback(
    async (relPath: string, newName: string) => {
      const dir = relPath.includes("/")
        ? relPath.slice(0, relPath.lastIndexOf("/"))
        : "";
      const newRel = dir === "" ? newName : `${dir}/${newName}`;
      if (newRel === relPath) return;
      try {
        await native.renameFile(abs(relPath), abs(newRel));
        state.notePathRenamed(relPath, newRel);
        props.onPathRenamed(abs(relPath), abs(newRel));
        index.refresh();
      } catch (e) {
        toast.error(`Could not rename: ${e}`);
        index.refresh();
      }
    },
    [abs, state, index, props.onPathRenamed],
  );

  const handleDelete = useCallback(async () => {
    const relPath = pendingDelete;
    setPendingDelete(null);
    if (!relPath) return;
    try {
      await invoke("fs_delete", { path: abs(relPath), workspace: currentWorkspaceEnv() });
      state.notePathDeleted(relPath);
      props.onPathDeleted(abs(relPath));
      index.refresh();
    } catch (e) {
      toast.error(`Could not delete: ${e}`);
      index.refresh();
    }
  }, [pendingDelete, abs, state, index, props.onPathDeleted]);

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel id="notes-collections" defaultSize="38%" minSize="20%" maxSize="60%">
          <CollectionsColumn
            quickAccess={state.config.quickAccess}
            notesByRelPath={notesByRelPath}
            folders={index.folders}
            notes={index.notes}
            collapsedFolders={state.config.collapsedFolders}
            selectedFolder={state.config.selectedFolder}
            editingFolder={editingFolder}
            onOpen={openRel}
            onReorderQuickAccess={state.reorderQuickAccess}
            onUnpin={state.toggleQuickAccess}
            onToggleFolderCollapsed={state.toggleFolderCollapsed}
            onSelectFolder={state.setSelectedFolder}
            onNewNoteIn={(folder) => void handleNewNoteIn(folder)}
            onNewFolder={(parent) => void handleNewFolder(parent)}
            onStartRenameFolder={setEditingFolder}
            onRenameFolder={(rel, name) => void handleRenameFolder(rel, name)}
            onRenameFolderDone={() => setEditingFolder(null)}
            onDeleteFolder={setPendingDelete}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="notes-list" minSize="30%">
          <NoteListColumn
            notes={visibleNotes}
            config={state.config}
            quickAccess={state.config.quickAccess}
            loading={index.loading}
            error={index.error}
            truncated={index.truncated}
            primedRenamePath={primedRenamePath}
            onRetry={index.refresh}
            onOpen={openRel}
            onOpenToSide={(rel) => props.onOpenToSide(abs(rel))}
            onTogglePin={state.toggleQuickAccess}
            onRename={handleRename}
            onDelete={setPendingDelete}
            onRevealInExplorer={(rel) => props.onRevealInExplorer(abs(rel))}
            onNewNote={() => void handleNewNoteIn(state.config.selectedFolder)}
            onSetSortMode={state.setSortMode}
            onSetGroupByDate={state.setGroupByDate}
            onSetNoteOrder={state.setNoteOrder}
            onRenameDone={() => setPrimedRenamePath(null)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete} will be permanently deleted (folders including their contents).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
