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

type PanelInfo = { id: string; title: string; kind: string; path?: string; processName?: string };

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
}: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (pendingTerminalClosePanel) setDontAskAgain(false);
  }, [pendingTerminalClosePanel]);

  return (
    <>
      <AlertDialog
        open={pendingClosePanel !== null}
        onOpenChange={(open) => !open && onCancelClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingClosePanel?.title
                ? `Close ${pendingClosePanel.title}?`
                : "Close file?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to close a file with unsaved changes
            </AlertDialogDescription>
          </AlertDialogHeader>
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
            <AlertDialogTitle>Close Terminal?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTerminalClosePanel?.processName
                ? `Process "${pendingTerminalClosePanel.processName}" is running`
                : "A process is running"}
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
