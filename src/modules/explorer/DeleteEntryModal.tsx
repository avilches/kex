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

export type DeleteEntryModalProps = {
  open: boolean;
  name: string;
  isDir: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onTrash: () => void;
};

export function DeleteEntryModal({
  open,
  name,
  isDir,
  onCancel,
  onDelete,
  onTrash,
}: DeleteEntryModalProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          // Default focus on the safe action (Move to trash), not Delete.
          e.preventDefault();
          (e.currentTarget as HTMLElement)
            .querySelector<HTMLElement>("[data-autofocus]")
            ?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {isDir ? "folder" : "file"} &quot;{name}&quot;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Move it to the system trash, or delete it permanently. Permanent
            deletion cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            Delete
          </AlertDialogAction>
          <AlertDialogAction data-autofocus onClick={onTrash}>
            Move to trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
