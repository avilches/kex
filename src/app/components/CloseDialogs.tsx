import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { pathBasename } from "@/lib/pathUtils";

type TabInfo = { id: string; title: string; kind: string; path?: string; processName?: string; command?: string };

type Props = {
  pendingCloseTab: TabInfo | null;
  onCancelClose: () => void;
  onSaveClose: () => void;
  onDontSaveClose: () => void;
  pendingTerminalCloseTab: TabInfo | null;
  onCancelTerminalClose: () => void;
  onConfirmTerminalClose: (dontAskAgain: boolean) => void;
  pendingDeleteTabs: TabInfo[] | null;
  onCancelDeleteClose: () => void;
  onConfirmDeleteClose: () => void;
  pendingCloseWorkspace: { id: string; scriptCount: number } | null;
  onCancelCloseWorkspace: () => void;
  onConfirmCloseWorkspace: (dontAskAgain: boolean) => void;
  pendingWorkspaceProcesses: { id: string; processes: { tabId: string; label: string }[] } | null;
  onCancelWorkspaceProcesses: () => void;
  onConfirmWorkspaceProcesses: (dontAskAgain: boolean) => void;
};

/** Confirmation dialogs for closing dirty editors and terminals with live processes. */
export function CloseDialogs({
  pendingCloseTab,
  onCancelClose,
  onSaveClose,
  onDontSaveClose,
  pendingTerminalCloseTab,
  onCancelTerminalClose,
  onConfirmTerminalClose,
  pendingDeleteTabs,
  onCancelDeleteClose,
  onConfirmDeleteClose,
  pendingCloseWorkspace,
  onCancelCloseWorkspace,
  onConfirmCloseWorkspace,
  pendingWorkspaceProcesses,
  onCancelWorkspaceProcesses,
  onConfirmWorkspaceProcesses,
}: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (pendingTerminalCloseTab) setDontAskAgain(false);
  }, [pendingTerminalCloseTab]);

  useEffect(() => {
    if (pendingCloseWorkspace) setDontAskAgain(false);
  }, [pendingCloseWorkspace]);

  useEffect(() => {
    if (pendingWorkspaceProcesses) setDontAskAgain(false);
  }, [pendingWorkspaceProcesses]);

  return (
    <>
      <AlertDialog
        open={pendingCloseTab !== null}
        onOpenChange={(open) => !open && onCancelClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                const name = pendingCloseTab?.path
                  ? pathBasename(pendingCloseTab.path)
                  : pendingCloseTab?.title;
                return name ? `Close file ${name}?` : "Close file?";
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to close a file with unsaved changes
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingCloseTab?.path && (
            <p className="text-[12px] text-muted-foreground break-all">
              Path: {pendingCloseTab.path}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelClose}>
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={onDontSaveClose}>
              Don't save
            </Button>
            <AlertDialogAction onClick={onSaveClose} autoFocus>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingTerminalCloseTab !== null}
        onOpenChange={(open) => !open && onCancelTerminalClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close terminal {pendingTerminalCloseTab?.processName || "process"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The running process will be killed
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingTerminalCloseTab?.command && (
            <p className="text-[12px] text-muted-foreground break-all">
              Command: {pendingTerminalCloseTab.command}
            </p>
          )}
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(v) => setDontAskAgain(v === true)}
            />
            Don't ask me again
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelTerminalClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onConfirmTerminalClose(dontAskAgain)}
              autoFocus
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingCloseWorkspace !== null}
        onOpenChange={(open) => !open && onCancelCloseWorkspace()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              All tabs will be closed.
            </AlertDialogDescription>
            {pendingCloseWorkspace?.scriptCount ? (
              <p className="text-sm text-muted-foreground">
                {pendingCloseWorkspace.scriptCount === 1
                  ? "1 run script"
                  : `${pendingCloseWorkspace.scriptCount} run scripts`}{" "}
                will also be deleted.
              </p>
            ) : null}
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(v) => setDontAskAgain(v === true)}
            />
            Don't ask me again
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelCloseWorkspace}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onConfirmCloseWorkspace(dontAskAgain)}
              autoFocus
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingWorkspaceProcesses !== null}
        onOpenChange={(open) => !open && onCancelWorkspaceProcesses()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingWorkspaceProcesses?.processes.length === 1
                ? "There is 1 terminal with a running process. Closing the workspace will end it."
                : `There are ${pendingWorkspaceProcesses?.processes.length ?? 0} terminals with running processes. Closing the workspace will end them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-1">
            {pendingWorkspaceProcesses?.processes.map((p) => (
              <li
                key={p.tabId}
                className="text-[12px] text-muted-foreground break-all"
              >
                {p.label}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(v) => setDontAskAgain(v === true)}
            />
            Don't ask me again
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelWorkspaceProcesses}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onConfirmWorkspaceProcesses(dontAskAgain)}
              autoFocus
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteTabs !== null}
        onOpenChange={(open) => !open && onCancelDeleteClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTabs?.length === 1
                ? (() => {
                    const title = pendingDeleteTabs[0]?.title;
                    return title
                      ? `"${title}" has unsaved changes. The file has been deleted. Close anyway?`
                      : "This file has unsaved changes. The file has been deleted. Close anyway?";
                  })()
                : `${pendingDeleteTabs?.length ?? 0} files have unsaved changes. They have been deleted. Close all anyway?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelDeleteClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteClose}>
              Close Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
