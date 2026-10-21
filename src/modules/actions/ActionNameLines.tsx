import { splitActionName } from "./lib/actionName";
import { cn } from "@/lib/utils";
import { StartTrimmed } from "@/components/StartTrimmed";

// Wherever an Action's name carries its variable suffix ("PyCharm {workspace}") it shows
// the plain name with a second line under it in small type, so lists read by app plus the
// place it points at. The second line is a plain value or reason when one is passed (the
// folder, the open file, the workspace root, "Workspace"); without one it stays the raw
// template. null (no value here) hides the line; startTrim renders a long path with its
// start cut instead of its tail.
export function ActionNameLines({
  name,
  value,
  startTrim,
  className,
}: {
  name: string;
  value?: string | null;
  startTrim?: boolean;
  className?: string;
}) {
  const { main, variable } = splitActionName(name);
  const subtitle = value === undefined ? variable : value;
  return (
    <span className={cn("flex min-w-0 flex-1 flex-col leading-tight", className)}>
      <span className="truncate">{main}</span>
      {subtitle && (
        startTrim ? (
          <StartTrimmed text={subtitle} className="flex font-mono text-[9.5px] text-muted-foreground" />
        ) : (
          <span className="truncate font-mono text-[9.5px] text-muted-foreground">{subtitle}</span>
        )
      )}
    </span>
  );
}
