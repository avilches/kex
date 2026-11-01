import { ArrowDown01Icon, File01Icon, Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import type { Scope } from "./lib/actionDrop";
import { appCombos } from "./lib/actionTargets";
import { scriptSubtitle, SETTINGS_LABELS } from "./lib/actionsBar";
import { BOXED_RADIO } from "./lib/boxedRadio";
import type { Action } from "./lib/types";
import { DEFAULT_ACCEPTS } from "@/modules/external-editors/catalog";

type Props = {
  action: Pick<Action, "id" | "name" | "appId" | "iconId" | "kind" | "ownButton" | "cwdMode" | "cwd" | "accepts">;
  scope: Scope;
  onChange: (own: boolean) => void;
};

const OPTIONS = [
  { value: "button", label: "Own button" },
  { value: "combo", label: "Inside the combo" },
] as const;

// Where the Action lives in the header bar, and a drawing of the bar for it. The Actions combo
// never moves: an own button sits to its left, and without one the combo shows open. An app that
// edits files also shows in the File combo; one that opens no folder is only there, so the
// Actions combo and the choice of an own button are gone.
export function OwnButtonChoice({ action, scope, onChange }: Props) {
  const { actions: inActions, file: inFile } = action.kind === "app" ? appCombos(action.accepts ?? DEFAULT_ACCEPTS) : { actions: true, file: false };
  const value = action.ownButton && inActions ? "button" : "combo";
  const display = action.name.trim() || "Action";
  const subtitle = scriptSubtitle({ ...action, name: display }, SETTINGS_LABELS);
  const item = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ActionIcon action={action} size={14} fill />
      <ActionNameLines name={display} value={subtitle.text ?? undefined} startTrim={subtitle.startTrim} lead={subtitle.lead} />
    </span>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">Where it shows in the header</span>
      <div className="flex items-center gap-3">
        {inActions && (
          <RadioGroup
            value={value}
            onValueChange={(v) => onChange(v === "button")}
            aria-label="Where it shows in the header"
            className="w-44 shrink-0 gap-2"
          >
            {OPTIONS.map((o) => (
              <label key={o.value} className={cn(BOXED_RADIO, "items-center text-[12px]")}>
                <RadioGroupItem value={o.value} />
                {o.label}
              </label>
            ))}
          </RadioGroup>
        )}
        <div
          aria-hidden
          data-own-button-preview={value}
          data-preview-file={inFile ? "" : undefined}
          className="relative flex h-[124px] min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/30 p-2"
        >
          <div className="flex items-center justify-end gap-1.5">
            {value === "button" && inActions && (
              <span className="flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2">
                <ActionIcon action={action} size={13} fill />
                <span className="max-w-[110px] min-w-0">
                  <ActionNameLines name={display} value={subtitle.text ?? undefined} startTrim={subtitle.startTrim} lead={subtitle.lead} />
                </span>
              </span>
            )}
            {inActions && (
              <span
                data-preview-combo
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px]",
                  value === "combo" && !inFile ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                <HugeiconsIcon icon={Rocket01Icon} size={13} strokeWidth={2} />
                Actions
                <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
              </span>
            )}
            {inFile && (
              <span
                data-preview-file-combo
                className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent px-1.5 text-[11px] text-foreground"
              >
                <HugeiconsIcon icon={File01Icon} size={13} strokeWidth={2} />
                File
                <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
              </span>
            )}
          </div>
          {(inFile || (value === "combo" && inActions)) && (
            <div className="ml-auto mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-md">
              {!inFile && (
                <span className="block px-1.5 py-1 text-[10px] text-muted-foreground">
                  {scope === "global" ? "Global actions" : "Workspace actions"}
                </span>
              )}
              <span className="flex min-h-9 items-center gap-2 rounded px-1.5 py-0.5 text-[12px] hover:bg-accent">{item}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
