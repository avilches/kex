import { splitActionName } from "./lib/actionName";
import { cn } from "@/lib/utils";

// Wherever an Action's name carries its variable suffix ("PyCharm {workspace}") it shows
// the plain name with the template part under it in small type, so lists read by app and
// the variable the preset points at stays legible without widening the row.
export function ActionNameLines({ name, className }: { name: string; className?: string }) {
  const { main, variable } = splitActionName(name);
  return (
    <span className={cn("flex min-w-0 flex-1 flex-col leading-tight", className)}>
      <span className="truncate">{main}</span>
      {variable && (
        <span className="truncate font-mono text-[9.5px] text-muted-foreground">{variable}</span>
      )}
    </span>
  );
}