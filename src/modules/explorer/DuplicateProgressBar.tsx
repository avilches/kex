import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { native } from "@/lib/native";
import { useDuplicateProgress } from "@/modules/explorer/lib/duplicateStore";

export function DuplicateProgressBar() {
  const progress = useDuplicateProgress();
  if (!progress) return null;
  const { name, copied, total } = progress;
  const pct = total > 0 ? Math.min(100, Math.round((copied / total) * 100)) : 0;

  return (
    <div className="absolute bottom-9 left-2 z-50 flex items-center gap-2 rounded-md border border-border bg-popover/95 px-3 py-1.5 text-xs text-foreground shadow-md backdrop-blur">
      <span className="max-w-48 truncate">Duplicating {name}</span>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
      <button
        type="button"
        title="Cancel"
        className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => void native.cancelDuplicate()}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
