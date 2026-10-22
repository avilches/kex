import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleArrowDownDoubleIcon,
  CircleArrowUpDoubleIcon,
  DragDropVerticalIcon,
  FolderOpenIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INPUT_CLASS } from "@/settings/components/inputClass";
import { StartTrimmed } from "@/components/StartTrimmed";
import { insertTitleVariable } from "@/modules/workspaces/lib/titleVariablesFor";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import { ActionIcon } from "./ActionIcon";
import { splitActionName } from "./lib/actionName";
import { actionSubtitle, SETTINGS_LABELS } from "./lib/actionsBar";
import {
  actionProblems,
  CWD_MODE_LABELS,
  commandDraft,
  commandVariableDocs,
  commitCommand,
} from "./lib/actionForm";
import type { ActionContext } from "./lib/useActionContext";
import type { Action } from "./lib/types";

export type ActionRowHandle = { focusCommand: () => void };

type Props = {
  action: Action;
  context: ActionContext | null;
  /** False while the row is a draft the store has not accepted yet. */
  saved: boolean;
  /** An app preset as Kex installs it: read-only, and deleting it asks nothing. */
  immutable?: boolean;
  /** Turns an immutable row into the user's own editable action; only immutable rows offer it. */
  onEdit?: () => void;
  /** Folded to its header row, like the file-type cards; drafts always stay expanded. */
  expanded: boolean;
  onToggleExpand: () => void;
  /** Offers the move between scopes; the row shows the direction it does not belong to. */
  onMoveToGlobal?: () => void;
  onMoveToWorkspace?: () => void;
  onChange: (next: Action) => void;
  onRemove: () => void;
};

const SMALL_BUTTON =
  "flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground";

export const ActionRow = forwardRef<ActionRowHandle, Props>(function ActionRow(
  { action, context, saved, immutable, onEdit, expanded, onToggleExpand, onMoveToGlobal, onMoveToWorkspace, onChange, onRemove },
  ref,
) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: action.id });
  const commandRef = useRef<HTMLTextAreaElement>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [draft, setDraft] = useState(action.command);
  const [commandFocused, setCommandFocused] = useState(false);
  const [name, setName] = useState(action.name);
  const [nameFocused, setNameFocused] = useState(false);
  const command = commandDraft({ draft, stored: action.command, focused: commandFocused, saved });
  const shownName = nameFocused ? name : action.name;
  const problems = actionProblems({ ...action, command: command.shown }, context);
  const blocking = problems.filter((p) => p.kind !== "context");
  const notes = problems.filter((p) => p.kind === "context");
  const cwdMode: ScriptCwdMode = action.cwdMode ?? "workspace";
  const display = action.name.trim() || "Name";
  const { main: displayMain, variable: displayVariable } = splitActionName(display);
  const subtitle = actionSubtitle(display, SETTINGS_LABELS);

  // The latest values for the unmount flush, which closes over nothing else. An immutable
  // row holds nothing pending, so its flush saves nothing and is skipped.
  const pending = useRef({ action, draft, onChange });
  pending.current = { action, draft, onChange };

  useImperativeHandle(ref, () => ({
    focusCommand: () => {
      if (!expanded && !immutable) onToggleExpand();
      requestAnimationFrame(() => {
        commandRef.current?.focus();
        commandRef.current?.select();
      });
    },
  }));

  const saveCommand = (value: string) => {
    const { save } = commitCommand(pending.current.action.command, value);
    if (save !== null) pending.current.onChange({ ...pending.current.action, command: save });
  };

  // Closing the dialog or Settings while a command is still being typed must not lose it.
  useEffect(() => {
    if (immutable) return;
    return () => saveCommand(pending.current.draft);
  }, [immutable]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-2",
        expanded ? "border-border" : "border-border/60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span {...attributes} {...listeners} aria-label="Drag to reorder" className="shrink-0 cursor-grab text-muted-foreground">
          <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
        </span>
        <button
          type="button"
          aria-label={expanded ? "Collapse action" : "Expand action"}
          aria-expanded={expanded}
          title={display}
          onClick={onToggleExpand}
          className="flex size-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <ActionIcon action={action} size={14} />
        </button>
        {expanded && !immutable ? (
          <input
            className={cn(INPUT_CLASS, "min-w-0 flex-1")}
            aria-label="Action name"
            placeholder="Name"
            spellCheck={false}
            value={shownName}
            onFocus={() => {
              setName(action.name);
              setNameFocused(true);
            }}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => {
              setNameFocused(false);
              if (e.target.value.trim() && e.target.value.trim() !== action.name) onChange({ ...action, name: e.target.value });
            }}
          />
        ) : (
          <span className="flex min-w-0 flex-1 flex-col leading-tight text-[12px]">
            <span className="truncate">{displayMain}</span>
            {subtitle?.text ? (
              subtitle.startTrim ? (
                <StartTrimmed text={subtitle.text} className="flex font-mono text-[9.5px] text-muted-foreground" />
              ) : (
                <span className="truncate font-mono text-[9.5px] text-muted-foreground">{subtitle.text}</span>
              )
            ) : (
              displayVariable && <span className="truncate font-mono text-[9.5px] text-muted-foreground">{displayVariable}</span>
            )}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          <Checkbox
            id={`${action.id}-own`}
            checked={action.ownButton}
            onCheckedChange={(v) => onChange({ ...action, ownButton: v === true })}
          />
          <label htmlFor={`${action.id}-own`} className={cn("text-[11px] text-muted-foreground", immutable ? "cursor-default" : "cursor-pointer")} title="Own button in the bar">
            Button
          </label>
        </span>
        {(onMoveToGlobal || onMoveToWorkspace) && (
          <button
            type="button"
            title={onMoveToGlobal ? "Move to global" : "Move to workspace only"}
            aria-label={onMoveToGlobal ? "Move to global" : "Move to workspace only"}
            className={SMALL_BUTTON}
            onClick={onMoveToGlobal ?? onMoveToWorkspace}
          >
            <HugeiconsIcon icon={onMoveToGlobal ? CircleArrowUpDoubleIcon : CircleArrowDownDoubleIcon} size={12} strokeWidth={2} />
          </button>
        )}
        {immutable ? (
          <button
            type="button"
            title="Remove"
            aria-label="Remove action"
            onClick={onRemove}
            className={cn(SMALL_BUTTON, "hover:text-destructive")}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
          </button>
        ) : (
          <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
            <AlertDialogTrigger asChild>
              <button type="button" title="Remove" aria-label="Remove action" className={cn(SMALL_BUTTON, "hover:text-destructive")}>
                <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="w-[360px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">Delete &quot;{display}&quot;?</AlertDialogTitle>
                <AlertDialogDescription className="text-[12px]">
                  The Action is removed{saved ? "" : " before it was ever saved"} and cannot come back.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onRemove}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {expanded ? (
          <button type="button" aria-label="Collapse action" onClick={onToggleExpand} className={SMALL_BUTTON}>
            <HugeiconsIcon icon={ChevronUpIcon} size={12} strokeWidth={2} />
          </button>
        ) : (
          <button type="button" aria-label="Expand action" onClick={onToggleExpand} className={SMALL_BUTTON}>
            <HugeiconsIcon icon={ChevronDownIcon} size={12} strokeWidth={2} />
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-1">
            <Textarea
              ref={commandRef}
              rows={3}
              readOnly={immutable}
              className={cn(
                INPUT_CLASS,
                "h-auto min-h-0 flex-1 resize-y font-mono leading-snug [field-sizing:fixed]",
                (command.required || blocking.some((p) => p.kind === "command")) && "border-destructive",
              )}
              aria-label="Command"
              aria-invalid={command.required}
              placeholder="Command"
              spellCheck={false}
              value={command.shown}
              onFocus={() => {
                setDraft(action.command);
                setCommandFocused(true);
              }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => {
                setCommandFocused(false);
                saveCommand(e.target.value);
              }}
            />
            {immutable && (
              <button
                type="button"
                title="Edit: turns it into your own action"
                aria-label="Edit action"
                onClick={onEdit}
                className={cn(SMALL_BUTTON, "mt-1")}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} size={12} strokeWidth={2} />
              </button>
            )}
            </div>
            {command.required && <div className="text-[11px] text-destructive">Command is required</div>}
            {!immutable && (
              <button
                type="button"
                aria-expanded={variablesOpen}
                onClick={() => setVariablesOpen((o) => !o)}
                className="flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <HugeiconsIcon icon={variablesOpen ? ArrowUp01Icon : ArrowDown01Icon} size={12} strokeWidth={2} />
                {variablesOpen ? "Hide variables" : "Show variables"}
              </button>
            )}
            {variablesOpen && (
              <div className="flex flex-col text-[11px] leading-snug">
                {commandVariableDocs().map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    title={v.description}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const area = commandRef.current;
                      if (!area) return;
                      const { value } = insertTitleVariable(area, `{${v.name}}`);
                      setDraft(value);
                      saveCommand(value);
                    }}
                    className="flex flex-col border-b border-border/30 py-0.5 pr-1 text-left transition-colors last:border-b-0 hover:bg-muted/50"
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="shrink-0 font-mono text-foreground">{`{${v.name}}`}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{v.description}</span>
                    </span>
                    {context?.vars[v.name] && (
                      <span className="w-full truncate font-mono text-[10px] text-muted-foreground/80" title={context.vars[v.name]}>
                        {context.vars[v.name]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {blocking.filter((p) => p.kind === "command").map((p) => (
              <div key={p.message} className="text-[11px] text-destructive">{p.message}</div>
            ))}
            {notes.map((p) => (
              <div key={p.message} className="text-[11px] text-muted-foreground">{p.message}</div>
            ))}
          </div>

          {action.runInTerminal && (
            <>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[11px] text-muted-foreground">Run in</span>
                <Select value={cwdMode} onValueChange={(v) => onChange({ ...action, cwdMode: v as ScriptCwdMode })}>
                  <SelectTrigger size="sm" aria-label="Run in" className="h-8 w-60 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CWD_MODE_LABELS) as ScriptCwdMode[]).map((mode) => (
                      <SelectItem key={mode} value={mode} className="text-[12px]">{CWD_MODE_LABELS[mode]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cwdMode === "fixed" && (
                <>
                  <div className="flex items-center gap-1">
                    <input
                      className={cn(INPUT_CLASS, "flex-1 font-mono")}
                      aria-label="Fixed folder path"
                      placeholder="Absolute path"
                      spellCheck={false}
                      defaultValue={action.cwd ?? ""}
                      key={action.cwd ?? ""}
                      onBlur={(e) => onChange({ ...action, cwd: e.target.value.trim() || undefined })}
                    />
                    <button
                      type="button"
                      title="Browse"
                      aria-label="Browse for a folder"
                      className={SMALL_BUTTON}
                      onClick={async () => {
                        const selected = await openFolderDialog({ directory: true, defaultPath: action.cwd || undefined });
                        if (typeof selected === "string") onChange({ ...action, cwd: selected });
                      }}
                    >
                      <HugeiconsIcon icon={FolderOpenIcon} size={12} strokeWidth={2} />
                    </button>
                  </div>
                  {blocking.filter((p) => p.kind === "cwd").map((p) => (
                    <div key={p.message} className="text-[11px] text-destructive">{p.message}</div>
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
});
