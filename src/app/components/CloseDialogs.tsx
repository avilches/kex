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

type PanelInfo = { id: string; title: string; kind: string; path?: string; processName?: string; command?: string };

type Props = {
  pendingClosePanel: PanelInfo | null;
  onCancelClose: () => void;
  onSaveClose: () => void;
  onDontSaveClose: () => void;
  pendingTerminalClosePanel: PanelInfo | null;
  onCancelTerminalClose: () => void;
  onConfirmTerminalClose: (dontAskAgain: boolean) => void;
  pendingDeletePanels: PanelInfo[] | null;
  onCancelDeleteClose: () => void;
  onConfirmDeleteClose: () => void;
  pendingCloseWorkspace: { id: string; isLast: boolean } | null;
  onCancelCloseWorkspace: () => void;
  onConfirmCloseWorkspace: (dontAskAgain: boolean) => void;
};

/** Confirmation dialogs for closing dirty editors and terminals with live processes. */
export function CloseDialogs({
  pendingClosePanel,
  onCancelClose,
  onSaveClose,
  onDontSaveClose,
  pendingTerminalClosePanel,
  onCancelTerminalClose,
  onConfirmTerminalClose,
  pendingDeletePanels,
  onCancelDeleteClose,
  onConfirmDeleteClose,
  pendingCloseWorkspace,
  onCancelCloseWorkspace,
  onConfirmCloseWorkspace,
}: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (pendingTerminalClosePanel) setDontAskAgain(false);
  }, [pendingTerminalClosePanel]);

  useEffect(() => {
    if (pendingCloseWorkspace) setDontAskAgain(false);
  }, [pendingCloseWorkspace]);

  return (
    <>
      <AlertDialog
        open={pendingClosePanel !== null}
        onOpenChange={(open) => !open && onCancelClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                const name = pendingClosePanel?.path
                  ? pathBasename(pendingClosePanel.path)
                  : pendingClosePanel?.title;
                return name ? `Close file ${name}?` : "Close file?";
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to close a file with unsaved changes
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingClosePanel?.path && (
            <p className="text-[12px] text-muted-foreground break-all">
              Path: {pendingClosePanel.path}
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
        open={pendingTerminalClosePanel !== null}
        onOpenChange={(open) => !open && onCancelTerminalClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close terminal {pendingTerminalClosePanel?.processName || "process"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The running process will be killed
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingTerminalClosePanel?.command && (
            <p className="text-[12px] text-muted-foreground break-all">
              Command: {pendingTerminalClosePanel.command}
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
            <AlertDialogTitle>Close this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCloseWorkspace?.isLast
                ? "This is the last workspace. Closing it will quit the app."
                : "The workspace and all of its tabs will be closed."}
            </AlertDialogDescription>
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
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeletePanels !== null}
        onOpenChange={(open) => !open && onCancelDeleteClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeletePanels?.length === 1
                ? (() => {
                    const title = pendingDeletePanels[0]?.title;
                    return title
                      ? `"${title}" has unsaved changes. The file has been deleted. Close anyway?`
                      : "This file has unsaved changes. The file has been deleted. Close anyway?";
                  })()
                : `${pendingDeletePanels?.length ?? 0} files have unsaved changes. They have been deleted. Close all anyway?`}
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
