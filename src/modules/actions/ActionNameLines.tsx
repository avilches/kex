import { PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SubtitleLead } from "./lib/actionsBar";
import { cn } from "@/lib/utils";
import { StartTrimmed } from "@/components/StartTrimmed";

// An Action's name with, when there is something to say, a line under it in small type: where a
// script that always runs in one place runs (the workspace root, "Workspace root" in Settings, or its
// fixed folder). null hides the line; startTrim renders a long path with its start cut instead of its
// tail; lead draws the workspace-root pin before it. The icon carries an explicit size class because
// menus force size-4 on every svg without one.
const LEAD_ICONS = { root: PinIcon };

export function ActionNameLines({
  name,
  value,
  startTrim,
  lead,
  className,
}: {
  name: string;
  value?: string | null;
  startTrim?: boolean;
  lead?: SubtitleLead | null;
  className?: string;
}) {
  const subtitle = value;
  return (
    <span className={cn("flex min-w-0 flex-1 flex-col leading-tight", className)}>
      <span className="truncate text-[12px]">{name}</span>
      {subtitle && (
        <span className="flex min-w-0 items-center gap-0.5 text-muted-foreground">
          {lead && <HugeiconsIcon icon={LEAD_ICONS[lead]} size={9} strokeWidth={2} className="size-[9px] shrink-0" />}
          {startTrim ? (
            <StartTrimmed text={subtitle} className="flex min-w-0 flex-1 font-mono text-[9.5px]" />
          ) : (
            <span className="truncate font-mono text-[9.5px]">{subtitle}</span>
          )}
        </span>
      )}
    </span>
  );
}
