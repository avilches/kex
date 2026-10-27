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
import { pathBasename } from "@/lib/pathUtils";

type TabInfo = { id: string; title: string; path?: string };

type Props = {
  pendingCloseTab: TabInfo | null;
  onCancelClose: () => void;
  onSaveClose: () => void;
  onDontSaveClose: () => void;
};

/** Confirmation dialog for closing a dirty editor. Terminals use HibernateDialog. */
export function CloseDialogs({ pendingCloseTab, onCancelClose, onSaveClose, onDontSaveClose }: Props) {
  const name = pendingCloseTab?.path ? pathBasename(pendingCloseTab.path) : pendingCloseTab?.title;
  return (
    <AlertDialog open={pendingCloseTab !== null} onOpenChange={(open) => !open && onCancelClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{name ? `Close file ${name}?` : "Close file?"}</AlertDialogTitle>
          <AlertDialogDescription>You are about to close a file with unsaved changes</AlertDialogDescription>
        </AlertDialogHeader>
        {pendingCloseTab?.path && (
          <p className="text-[12px] text-muted-foreground break-all">Path: {pendingCloseTab.path}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancelClose}>Cancel</AlertDialogCancel>
          <Button variant="outline" onClick={onDontSaveClose}>
            Don't save
          </Button>
          <AlertDialogAction onClick={onSaveClose} autoFocus>
            Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
