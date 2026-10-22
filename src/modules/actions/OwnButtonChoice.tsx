import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { splitActionName } from "./lib/actionName";
import type { Action } from "./lib/types";

type Props = {
  action: Pick<Action, "id" | "name" | "appId" | "iconId" | "runInTerminal" | "ownButton">;
  onChange: (own: boolean) => void;
};

const OPTIONS = [
  { value: "button", label: "Own button" },
  { value: "combo", label: "Inside the combo" },
] as const;

// Where the Action lives in the header bar, as two radio options and, next to them, a small
// drawing of the bar for the one chosen: an own button beside an empty combo, or only the
// combo, open, with this Action as its entry.
export function OwnButtonChoice({ action, onChange }: Props) {
  const value = action.ownButton ? "button" : "combo";
  const name = splitActionName(action.name.trim() || "Action").main;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">Where it shows in the header</span>
      <div className="flex items-stretch gap-3">
        <RadioGroup
          value={value}
          onValueChange={(v) => onChange(v === "button")}
          aria-label="Where it shows in the header"
          className="w-40 shrink-0 gap-2.5 self-center"
        >
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-[12px]">
              <RadioGroupItem value={o.value} />
              {o.label}
            </label>
          ))}
        </RadioGroup>
        <div
          aria-hidden
          data-own-button-preview={value}
          className="relative h-[84px] min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-muted/30 p-2"
        >
          <div className="flex items-center gap-1.5">
            {value === "button" && (
              <span className="flex h-6 min-w-0 items-center gap-1 rounded-md border border-border bg-card px-1.5 text-[11px]">
                <ActionIcon action={action} size={12} />
                <span className="max-w-[72px] truncate">{name}</span>
              </span>
            )}
            <span
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px]",
                value === "combo" ? "border-primary/60 bg-card" : "border-border bg-card text-muted-foreground",
              )}
            >
              Actions
              <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
            </span>
          </div>
          {value === "combo" && (
            <div className="mt-1 w-32 rounded-md border border-border bg-popover p-1 shadow-md">
              <span className="flex h-6 items-center gap-1.5 rounded bg-accent px-1.5 text-[11px]">
                <ActionIcon action={action} size={12} />
                <span className="truncate">{name}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
