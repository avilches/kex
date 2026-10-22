import { ArrowDown01Icon, ArrowUp01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INPUT_CLASS } from "@/settings/components/inputClass";
import { insertTitleVariable } from "@/modules/workspaces/lib/titleVariablesFor";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import { ActionIcon } from "./ActionIcon";
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
  onChange: (next: Action) => void;
  onClose: () => void;
};

// The edit form of one Action, in a modal. Everything saves as it is typed (the name and the
// command when the field loses focus, the rest at once), so Close only leaves; closing with
// Escape or the backdrop flushes what is still being typed. A preset is edited like any other
// Action: the host decides when a change makes it the user's own.
export function ActionEditDialog({ action, context, scope, saved, onChange, onClose }: Props) {
  const commandRef = useRef<HTMLTextAreaElement>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
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

  const title = `${saved ? "Edit" : "New"} ${script ? "script" : "application"}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100vh-3rem)] gap-4 overflow-y-auto rounded-2xl p-5 sm:max-w-[460px]"
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
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {scope === "global" ? "Global" : "Workspace"}
          </span>
        </div>
        <DialogDescription className="sr-only">
          Changes are saved as you type. Close leaves the editor.
        </DialogDescription>

        {script && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">Run in</span>
            <Select value={cwdMode} onValueChange={(v) => onChange({ ...action, cwdMode: v as ScriptCwdMode })}>
              <SelectTrigger size="sm" aria-label="Run in" className="h-8 w-full text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CWD_MODE_LABELS) as ScriptCwdMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode} className="text-[12px]">
                    {CWD_MODE_LABELS[mode]}
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
          />
        </label>

        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">Command</span>
            <Textarea
              ref={commandRef}
              rows={3}
              className={cn(
                INPUT_CLASS,
                "h-auto min-h-0 w-full resize-y font-mono leading-snug [field-sizing:fixed]",
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
          </label>
          {command.required && <div className="text-[11px] text-destructive">Command is required</div>}
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
            <div className="flex max-h-48 flex-col overflow-y-auto text-[11px] leading-snug">
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

        <div className="flex items-center gap-2">
          <Checkbox
            id={`${action.id}-own`}
            checked={action.ownButton}
            onCheckedChange={(v) => onChange({ ...action, ownButton: v === true })}
          />
          <label htmlFor={`${action.id}-own`} className="cursor-pointer text-[12px]">
            Own button in the header bar
          </label>
        </div>

        <div className="flex justify-end border-t border-border pt-3">
          <Button size="sm" className="h-8 px-4 text-[12px]" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
