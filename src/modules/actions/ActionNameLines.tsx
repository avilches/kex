import { splitActionName } from "./lib/actionName";
import { cn } from "@/lib/utils";

// Wherever an Action's name carries its variable suffix ("PyCharm {workspace}") it shows
// the plain name with a second line under it in small type, so lists read by app plus the
// place it points at. The second line is the value the current place gives that variable
// when one is passed (the folder, the open file, the workspace root); without one it stays
// the raw template. null (no value here) hides the line; the reason carries the explanation.
export function ActionNameLines({ name, value, className }: { name: string; value?: string | null; className?: string }) {
  const { main, variable } = splitActionName(name);
  const subtitle = value === undefined ? variable : value;
  return (
    <span className={cn("flex min-w-0 flex-1 flex-col leading-tight", className)}>
      <span className="truncate">{main}</span>
      {subtitle && <span className="truncate font-mono text-[9.5px] text-muted-foreground">{subtitle}</span>}
    </span>
  );
}
