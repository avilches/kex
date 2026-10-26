import { PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { splitActionName } from "./lib/actionName";
import { cn } from "@/lib/utils";
import { StartTrimmed } from "@/components/StartTrimmed";

// Wherever an Action's name carries its variable suffix ("PyCharm {workspace}") it shows
// the plain name with a second line under it in small type, so lists read by app plus the
// place it points at. The second line is a plain value or reason when one is passed (the
// folder, the open file, the workspace root, "Workspace"); without one it stays the raw
// template. null (no value here) hides the line; startTrim renders a long path with its
// start cut instead of its tail; root draws the workspace-root pin before the line.
export function ActionNameLines({
  name,
  value,
  startTrim,
  root,
  className,
}: {
  name: string;
  value?: string | null;
  startTrim?: boolean;
  root?: boolean;
  className?: string;
}) {
  const { main, variable } = splitActionName(name);
  const subtitle = value === undefined ? variable : value;
  return (
    <span className={cn("flex min-w-0 flex-1 flex-col leading-tight", className)}>
      <span className="truncate text-[12px]">{main}</span>
      {subtitle && (
        <span className="flex min-w-0 items-center gap-0.5 text-muted-foreground">
          {root && <HugeiconsIcon icon={PinIcon} size={9} strokeWidth={2} className="shrink-0" />}
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
