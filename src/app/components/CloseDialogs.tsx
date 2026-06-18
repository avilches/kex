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

type PanelInfo = { id: string; title: string; kind: string; path?: string; processName?: string };

type Props = {
  pendingClosePanel: PanelInfo | null;
  onCancelClose: () => void;
  onConfirmClose: () => void;
  pendingTerminalClosePanel: PanelInfo | null;
  onCancelTerminalClose: () => void;
  onConfirmTerminalClose: () => void;
  pendingDeletePanels: PanelInfo[] | null;
  onCancelDeleteClose: () => void;
  onConfirmDeleteClose: () => void;
};

/** Confirmation dialogs for closing dirty editors and terminals with live processes. */
export function CloseDialogs({
  pendingClosePanel,
  onCancelClose,
  onConfirmClose,
  pendingTerminalClosePanel,
  onCancelTerminalClose,
  onConfirmTerminalClose,
  pendingDeletePanels,
  onCancelDeleteClose,
  onConfirmDeleteClose,
}: Props) {
  return (
    <>
      <AlertDialog
        open={pendingClosePanel !== null}
        onOpenChange={(open) => !open && onCancelClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingClosePanel?.title
                ? `"${pendingClosePanel.title}" has unsaved changes. Close anyway?`
                : "This file has unsaved changes. Close anyway?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmClose}>
              Close Anyway
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
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelTerminalClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmTerminalClose} autoFocus>
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
