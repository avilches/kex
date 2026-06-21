import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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
import { native } from "@/lib/native";
import { useDuplicateProgress } from "@/modules/explorer/lib/duplicateStore";

export function DuplicateQuitModal() {
  const [open, setOpen] = useState(false);
  const [promptName, setPromptName] = useState("");
  const progress = useDuplicateProgress();

  useEffect(() => {
    const ups = [
      listen<{ name: string; copied: number; total: number }>(
        "kex:duplicate-quit-prompt",
        (e) => {
          setPromptName(e.payload.name);
          setOpen(true);
        },
      ),
      listen("kex:duplicate-quit-dismissed", () => setOpen(false)),
      // The copy finished and the app is about to exit; hide the modal so it
      // does not linger during the flush before process termination.
      listen("kex:before-quit", () => setOpen(false)),
    ];
    return () => {
      for (const up of ups) void up.then((u) => u());
    };
  }, []);

  const name = progress?.name ?? promptName;
  const total = progress?.total ?? 0;
  const copied = progress?.copied ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((copied / total) * 100)) : 0;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duplication in progress</AlertDialogTitle>
          <AlertDialogDescription>
            Duplicating {name}. The app will close automatically when the copy
            finishes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void native.cancelQuit()}>
            Keep app open
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => void native.cancelDuplicate()}>
            Cancel copy &amp; quit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
