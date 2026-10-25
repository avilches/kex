import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ComputerTerminal01Icon,
  FolderOpenIcon,
  Home01Icon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INPUT_CLASS } from "@/settings/components/inputClass";
import { insertTitleVariable } from "@/modules/workspaces/lib/titleVariablesFor";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import { ActionIcon } from "./ActionIcon";
import { OwnButtonChoice } from "./OwnButtonChoice";
import { actionProblems, CWD_MODE_LABELS, commandDraft, commandVariableDocs, commitCommand } from "./lib/actionForm";
import type { Scope } from "./lib/actionDrop";
import type { ActionContext } from "./lib/useActionContext";
import type { Action } from "./lib/types";

const SMALL_BUTTON =
  "flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground";

type Props = {
  action: Action;
  context: ActionContext | null;
  scope: Scope;
  /** False while the action is a draft the store has not accepted yet. */
  saved: boolean;
  /** False while no workspace is open: the Action cannot move there. */
  workspaceAvailable: boolean;
  /** Shown under This workspace, like the column header does. */
  workspaceName: string | null;
  onScopeChange: (to: Scope) => void;
  onChange: (next: Action) => void;
  onClose: () => void;
};

const CWD_MODE_ICONS = {
  home: Home01Icon,
  workspace: PinIcon,
  context: ComputerTerminal01Icon,
  fixed: FolderOpenIcon,
} as const;


// The edit form of one Action, in a modal. Everything saves as it is typed (the name and the
// command when the field loses focus, the rest at once), so Close only leaves; closing with
// Escape or the backdrop flushes what is still being typed. A preset is edited like any other
// Action: the host decides when a change makes it the user's own.
export function ActionEditDialog({ action, context, scope, saved, workspaceAvailable, workspaceName, onScopeChange, onChange, onClose }: Props) {
  const commandRef = useRef<HTMLTextAreaElement>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  // While the folder Select is open, or in the same event that closes it, a click on the form is
  // an outside click for the modal too: it must only close the Select.
  const selectGuard = useRef(false);
  const onSelectOpenChange = (open: boolean) => {
    if (open) selectGuard.current = true;
    else setTimeout(() => (selectGuard.current = false), 0);
  };
  const [draft, setDraft] = useState(action.command);
  const [commandFocused, setCommandFocused] = useState(false);
  const [name, setName] = useState(action.name);
  const [nameFocused, setNameFocused] = useState(false);
  const command = commandDraft({ draft, stored: action.command, focused: commandFocused, saved });
  const shownName = nameFocused ? name : action.name;
  const problems = actionProblems({ ...action, command: command.shown }, context);
  const blocking = problems.filter((p) => p.kind !== "context");
  const notes = problems.filter((p) => p.kind === "context");
  const cwdMode: ScriptCwdMode = action.cwdMode ?? "home";
  const script = action.runInTerminal;

  // The latest values for the unmount flush, which closes over nothing else.
  const pending = useRef({ action, draft, name, nameFocused, onChange });
  pending.current = { action, draft, name, nameFocused, onChange };

  const saveCommand = (value: string) => {
    const { save } = commitCommand(pending.current.action.command, value);
    if (save !== null) pending.current.onChange({ ...pending.current.action, command: save });
  };
  const saveName = (value: string) => {
    const next = value.trim();
    if (next && next !== pending.current.action.name) pending.current.onChange({ ...pending.current.action, name: next });
  };

  // Escape or a click on the backdrop never blurs the field, and the form unmounts with the
  // dialog, so what is still being typed is saved here.
  useEffect(
    () => () => {
      if (pending.current.nameFocused) saveName(pending.current.name);
      saveCommand(pending.current.draft);
    },
    [],
  );

  const fieldLabel = script ? "Script" : "Command";
  const title = `${saved ? "Edit" : "New"} ${script ? "script" : "application"}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100vh-3rem)] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto rounded-2xl p-5 sm:max-w-[560px]"
        onInteractOutside={(e) => {
          if (selectGuard.current) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => {
          if (saved) return;
          e.preventDefault();
          commandRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2.5 pr-1">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ActionIcon action={action} size={14} />
          </span>
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</DialogTitle>
          <div role="radiogroup" aria-label="Where it is available" className="flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
            {(
              [
                { value: "workspace", title: "This workspace", hint: workspaceName ?? "no workspace open" },
                { value: "global", title: "Global", hint: "every workspace" },
              ] as const
            ).map((s) => {
              const disabled = s.value === "workspace" && !workspaceAvailable;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  value={s.value}
                  aria-checked={scope === s.value}
                  disabled={disabled}
                  title={s.hint}
                  onClick={() => onScopeChange(s.value)}
                  className={cn(
                    "h-5 rounded px-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    scope === s.value ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        </div>
        <DialogDescription className="sr-only">
          Changes are saved as you type. Done leaves the editor.
        </DialogDescription>

        {script && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">Run in folder</span>
            <Select value={cwdMode} onOpenChange={onSelectOpenChange} onValueChange={(v) => onChange({ ...action, cwdMode: v as ScriptCwdMode })}>
              <SelectTrigger size="sm" aria-label="Run in folder" className="h-8 w-full text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CWD_MODE_LABELS) as ScriptCwdMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode} className="text-[12px]">
                    <span className="flex items-center gap-2">
                      <HugeiconsIcon icon={CWD_MODE_ICONS[mode]} size={13} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                      {CWD_MODE_LABELS[mode]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                {blocking
                  .filter((p) => p.kind === "cwd")
                  .map((p) => (
                    <div key={p.message} className="text-[11px] text-destructive">
                      {p.message}
                    </div>
                  ))}
              </>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">Name</span>
          <input
            className={cn(INPUT_CLASS, "w-full")}
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
              saveName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </label>

        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">{fieldLabel}</span>
            <Textarea
              ref={commandRef}
              rows={3}
              className={cn(
                INPUT_CLASS,
                "h-auto min-h-0 w-full resize-y font-mono leading-snug [field-sizing:fixed]",
                (command.required || blocking.some((p) => p.kind === "command")) && "border-destructive",
              )}
              aria-label={fieldLabel}
              aria-invalid={command.required}
              placeholder={fieldLabel}
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
          </label>
          {command.required && <div className="text-[11px] text-destructive">{fieldLabel} is required</div>}
          <button
            type="button"
            aria-expanded={variablesOpen}
            onClick={() => setVariablesOpen((o) => !o)}
            className="flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <HugeiconsIcon icon={variablesOpen ? ArrowUp01Icon : ArrowDown01Icon} size={12} strokeWidth={2} />
            {variablesOpen ? "Hide variables" : "Show variables"}
          </button>
          {variablesOpen && (
            <div className="flex min-w-0 flex-col text-[11px] leading-snug">
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
                  className="flex min-w-0 flex-col border-b border-border/30 py-1 pr-1 text-left transition-colors last:border-b-0 hover:bg-muted/50"
                >
                  <span className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-2">
                    <span className="font-mono text-foreground">{`{${v.name}}`}</span>
                    <span className="text-muted-foreground">{v.description}</span>
                  </span>
                  {context?.vars[v.name] && (
                    <span className="w-full truncate pl-[6.25rem] font-mono text-[10px] text-muted-foreground/80" title={context.vars[v.name]}>
                      {context.vars[v.name]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {blocking
            .filter((p) => p.kind === "command")
            .map((p) => (
              <div key={p.message} className="text-[11px] text-destructive">
                {p.message}
              </div>
            ))}
          {notes.map((p) => (
            <div key={p.message} className="text-[11px] text-muted-foreground">
              {p.message}
            </div>
          ))}
        </div>

        <OwnButtonChoice action={action} scope={scope} onChange={(own) => onChange({ ...action, ownButton: own })} />

        <div className="flex justify-end border-t border-border pt-3">
          <Button size="sm" className="h-8 px-4 text-[12px]" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
