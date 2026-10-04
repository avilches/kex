import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { pathBasename } from "@/lib/pathUtils";

type Props = {
  path: string;
  onKeep: () => void;
  onReload: () => void;
};

// Blocks the pane instead of a background toast: the buffer is dirty and the
// file also changed on disk, so continuing to type would edit against a base
// that no longer matches what either side has. Blurs whatever was focused so
// a stray keystroke lands nowhere instead of reaching the editor underneath.
export function ReloadConflictOverlay({ path, onKeep, onReload }: Props) {
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-popover p-5 text-center shadow-lg">
        <div className="text-[13px] text-foreground">
          {pathBasename(path)} changed on disk
        </div>
        <div className="text-[12px] text-muted-foreground">
          You have unsaved changes here. Choose whether to keep them or reload
          the version from disk.
        </div>
        <div className="mt-1 flex gap-2">
          <Button variant="outline" size="sm" onClick={onKeep}>
            Keep my changes
          </Button>
          <Button size="sm" onClick={onReload}>
            Reload from disk
          </Button>
        </div>
      </div>
    </div>
  );
}
