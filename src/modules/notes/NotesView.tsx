import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { native } from "@/lib/native";
import { pathBasename } from "@/lib/pathUtils";
import { DeleteEntryModal } from "@/modules/explorer/DeleteEntryModal";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CollectionsColumn } from "./CollectionsColumn";
import { notesReadDirs } from "./lib/notesDir";
import { nextFolderName, nextUntitledName } from "./lib/noteSort";
import { useNotesDirs } from "./lib/useNotesDirs";
import { useNotesState } from "./lib/useNotesState";
import { useQuickAccessHeads } from "./lib/useQuickAccessHeads";
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
  const { dirs, loading, error, reload } = useNotesDirs(
    canonRoot,
    props.active,
    state.config.expandedFolders,
    state.config.selectedFolder,
  );
  const selected = dirs.get(state.config.selectedFolder);
  const visibleNotes = selected?.notes ?? [];
  const [primedRenamePath, setPrimedRenamePath] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    relPath: string;
    isDir: boolean;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: props.active and canonRoot are reset triggers, not read in the body
  useEffect(() => {
    // DeleteEntryModal wraps an AlertDialog rendered through a Radix Portal,
    // so it escapes the sidebar's invisible/pointer-events-none hide
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
  const quickAccessHeads = useQuickAccessHeads(
    canonRoot,
    state.config.quickAccess,
    props.active,
  );
  const rootLabel = useMemo(() => pathBasename(canonRoot) || "/", [canonRoot]);

  const openRel = useCallback(
    (relPath: string, pin?: boolean) => props.onOpenFile(abs(relPath), pin),
    [abs, props.onOpenFile],
  );

  const handleNewNoteIn = useCallback(
    async (folder: string) => {
      let dir = dirs.get(folder);
      if (!dir) {
        const [fresh] = await notesReadDirs(canonRoot, [folder]);
        dir = fresh;
      }
      const siblings = (dir?.notes ?? []).map((n) => pathBasename(n.relPath));
      const name = nextUntitledName(siblings);
      const relPath = folder === "" ? name : `${folder}/${name}`;
      try {
        await native.createFile(abs(relPath));
        // The list shows one folder, so the primed row only mounts if that
        // folder is the selected one.
        state.setSelectedFolder(folder);
        setPrimedRenamePath(relPath);
        props.onOpenFile(abs(relPath), true);
        reload();
      } catch (e) {
        console.error("Failed to create note:", e);
        toast.error("Failed to create note", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [dirs, reload, canonRoot, abs, state, props.onOpenFile],
  );

  const handleNewFolder = useCallback(
    async (parent: string) => {
      const siblings = dirs.get(parent)?.subfolders.map((s) => s.name) ?? [];
      const name = nextFolderName(siblings);
      const relPath = parent === "" ? name : `${parent}/${name}`;
      try {
        await native.createDir(abs(relPath));
        // A collapsed parent renders no children, so the row carrying the
        // rename input would never mount. Root rows always render.
        if (parent !== "") state.expandFolder(parent);
        setEditingFolder(relPath);
        reload();
      } catch (e) {
        console.error("Failed to create folder:", e);
        toast.error("Failed to create folder", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [dirs, reload, abs, state],
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
        reload();
      } catch (e) {
        console.error("Failed to rename folder:", e);
        toast.error("Failed to rename folder", {
          description: e instanceof Error ? e.message : String(e),
        });
        reload();
      }
    },
    [abs, state, reload, props.onPathRenamed],
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
        reload();
      } catch (e) {
        console.error("Failed to rename:", e);
        toast.error("Failed to rename", {
          description: e instanceof Error ? e.message : String(e),
        });
        reload();
      }
    },
    [abs, state, reload, props.onPathRenamed],
  );

  const handleDelete = useCallback(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    const { relPath } = target;
    try {
      await invoke("fs_delete", { path: abs(relPath), workspace: currentWorkspaceEnv() });
      state.notePathDeleted(relPath);
      props.onPathDeleted(abs(relPath));
      reload();
    } catch (e) {
      console.error("fs_delete failed:", e);
      toast.error(`Failed to delete "${pathBasename(relPath)}"`, {
        description: e instanceof Error ? e.message : String(e),
      });
      reload();
    }
  }, [pendingDelete, abs, state, reload, props.onPathDeleted]);

  const handleTrash = useCallback(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    const { relPath } = target;
    try {
      await invoke("fs_trash", { path: abs(relPath), workspace: currentWorkspaceEnv() });
      state.notePathDeleted(relPath);
      props.onPathDeleted(abs(relPath));
      reload();
    } catch (e) {
      console.error("fs_trash failed:", e);
      toast.error(`Failed to move "${pathBasename(relPath)}" to trash`, {
        description: e instanceof Error ? e.message : String(e),
      });
      reload();
    }
  }, [pendingDelete, abs, state, reload, props.onPathDeleted]);

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel id="notes-collections" defaultSize="38%" minSize="20%" maxSize="60%">
          <CollectionsColumn
            quickAccess={state.config.quickAccess}
            heads={quickAccessHeads}
            dirs={dirs}
            rootLabel={rootLabel}
            expandedFolders={state.config.expandedFolders}
            selectedFolder={state.config.selectedFolder}
            editingFolder={editingFolder}
            onOpen={openRel}
            onReorderQuickAccess={state.reorderQuickAccess}
            onUnpin={state.toggleQuickAccess}
            onToggleFolderExpanded={state.toggleFolderExpanded}
            onSelectFolder={state.setSelectedFolder}
            onNewNoteIn={(folder) => void handleNewNoteIn(folder)}
            onNewFolder={(parent) => void handleNewFolder(parent)}
            onStartRenameFolder={setEditingFolder}
            onRenameFolder={(rel, name) => void handleRenameFolder(rel, name)}
            onRenameFolderDone={() => setEditingFolder(null)}
            onDeleteFolder={(relPath) => setPendingDelete({ relPath, isDir: true })}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="notes-list" minSize="30%">
          <NoteListColumn
            notes={visibleNotes}
            config={state.config}
            quickAccess={state.config.quickAccess}
            loading={loading}
            error={error ?? selected?.error ?? null}
            primedRenamePath={primedRenamePath}
            onRetry={reload}
            onOpen={openRel}
            onOpenToSide={(rel) => props.onOpenToSide(abs(rel))}
            onTogglePin={state.toggleQuickAccess}
            onRename={handleRename}
            onDelete={(relPath) => setPendingDelete({ relPath, isDir: false })}
            onRevealInExplorer={(rel) => props.onRevealInExplorer(abs(rel))}
            onNewNote={() => void handleNewNoteIn(state.config.selectedFolder)}
            onSetSortMode={state.setSortMode}
            onSetGroupByDate={state.setGroupByDate}
            onSetFolderOrder={state.setFolderOrder}
            onRenameDone={() => setPrimedRenamePath(null)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {pendingDelete && (
        <DeleteEntryModal
          open
          name={pathBasename(pendingDelete.relPath)}
          isDir={pendingDelete.isDir}
          onCancel={() => setPendingDelete(null)}
          onDelete={() => void handleDelete()}
          onTrash={() => void handleTrash()}
        />
      )}
    </>
  );
}
