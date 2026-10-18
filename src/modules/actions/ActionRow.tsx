import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  DragDropVerticalIcon,
  FolderOpenIcon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { INPUT_CLASS } from "@/settings/components/inputClass";
import { insertTitleVariable } from "@/modules/workspaces/lib/titleVariablesFor";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import { ActionIcon } from "./ActionIcon";
import {
  actionProblems,
  CWD_MODE_LABELS,
  commandVariableDocs,
  withKind,
  withSuggestion,
} from "./lib/actionForm";
import type { AppSuggestion } from "./lib/appSuggestions";
import { CUSTOM_APP_SUGGESTION } from "./lib/appSuggestions";
import type { ActionContext } from "./lib/useActionContext";
import type { Action } from "./lib/types";

export type ActionRowHandle = { focusCommand: () => void };

type Props = {
  action: Action;
  suggestions: readonly AppSuggestion[];
  context: ActionContext | null;
  /** Short button that moves a workspace Action to the global list; absent in Settings. */
  onMakeGlobal?: () => void;
  onChange: (next: Action) => void;
  onRemove: () => void;
};

const SMALL_BUTTON =
  "flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground";

export const ActionRow = forwardRef<ActionRowHandle, Props>(function ActionRow(
  { action, suggestions, context, onMakeGlobal, onChange, onRemove },
  ref,
) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: action.id });
  const commandRef = useRef<HTMLInputElement>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [commandDirty, setCommandDirty] = useState(false);
  const [command, setCommand] = useState(action.command);
  const problems = actionProblems({ ...action, command }, context);
  const blocking = problems.filter((p) => p.kind !== "context");
  const notes = problems.filter((p) => p.kind === "context");
  const cwdMode: ScriptCwdMode = action.cwdMode ?? "workspace";
  const kindId = `${action.id}-kind`;

  useImperativeHandle(ref, () => ({
    focusCommand: () => {
      commandRef.current?.focus();
      commandRef.current?.select();
    },
  }));

  const change = (patch: Action) => {
    onChange(patch);
    setCommand(patch.command);
  };

  const pickSuggestion = (key: string) => {
    const picked = key === CUSTOM_APP_SUGGESTION.key
      ? CUSTOM_APP_SUGGESTION
      : suggestions.find((s) => s.key === key);
    if (picked) change(withSuggestion({ ...action, command }, picked));
  };

  const currentKey = suggestions.find((s) => s.appId && s.appId === action.appId)?.key;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex flex-col gap-2 rounded-md border border-border/60 p-2"
    >
      <div className="flex items-center gap-1.5">
        <span {...attributes} {...listeners} className="shrink-0 cursor-grab text-muted-foreground">
          <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
        </span>
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          <ActionIcon action={action} size={14} />
        </span>
        <input
          className={cn(INPUT_CLASS, "min-w-0 flex-1")}
          aria-label="Action name"
          placeholder="Name"
          spellCheck={false}
          defaultValue={action.name}
          onBlur={(e) => onChange({ ...action, name: e.target.value })}
        />
        {onMakeGlobal && (
          <button type="button" title="Make global: move to Settings" aria-label="Make global" onClick={onMakeGlobal} className={SMALL_BUTTON}>
            <HugeiconsIcon icon={Globe02Icon} size={12} strokeWidth={2} />
          </button>
        )}
        <button type="button" title="Remove" aria-label="Remove action" onClick={onRemove} className={cn(SMALL_BUTTON, "hover:text-destructive")}>
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      </div>

      <RadioGroup
        className="flex w-auto gap-4 pl-1"
        value={action.runInTerminal ? "script" : "app"}
        onValueChange={(v) => change(withKind({ ...action, command }, v === "script"))}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="script" id={`${kindId}-script`} />
          <label htmlFor={`${kindId}-script`} className="cursor-pointer text-[12px]">Script (runs in a terminal)</label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="app" id={`${kindId}-app`} />
          <label htmlFor={`${kindId}-app`} className="cursor-pointer text-[12px]">App (opens in the background)</label>
        </div>
      </RadioGroup>

      {!action.runInTerminal && (
        <Select value={currentKey ?? CUSTOM_APP_SUGGESTION.key} onValueChange={pickSuggestion}>
          <SelectTrigger size="sm" aria-label="App" className="h-8 w-full text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {suggestions.map((s) => (
              <SelectItem key={s.key} value={s.key} className="text-[12px]">{s.name}</SelectItem>
            ))}
            <SelectItem value={CUSTOM_APP_SUGGESTION.key} className="text-[12px]">{CUSTOM_APP_SUGGESTION.name}</SelectItem>
          </SelectContent>
        </Select>
      )}

      <div className="flex flex-col gap-1">
        <input
          ref={commandRef}
          className={cn(INPUT_CLASS, "font-mono", commandDirty && (!command.trim() || blocking.some((p) => p.kind === "command")) && "border-destructive")}
          aria-label="Command"
          placeholder={action.runInTerminal ? "Command (e.g. pnpm dev)" : "Command (e.g. pycharm {workspace})"}
          spellCheck={false}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onBlur={(e) => {
            setCommandDirty(true);
            onChange({ ...action, command: e.target.value });
          }}
        />
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
          <div className="flex flex-col text-[11px] leading-snug">
            {commandVariableDocs().map((v) => (
              <button
                key={v.name}
                type="button"
                title={v.description}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const input = commandRef.current;
                  if (!input) return;
                  const { value } = insertTitleVariable(input, `{${v.name}}`);
                  setCommand(value);
                }}
                className="flex items-center gap-2 border-b border-border/30 py-0.5 pr-1 text-left transition-colors last:border-b-0 hover:bg-muted/50"
              >
                <span className="shrink-0 font-mono text-foreground">{`{${v.name}}`}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{v.description}</span>
                {context && (
                  <span className="max-w-[110px] shrink-0 truncate font-mono text-muted-foreground" title={context.vars[v.name]}>
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

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${action.id}-own`}
          checked={action.ownButton}
          onCheckedChange={(v) => onChange({ ...action, ownButton: v === true })}
        />
        <label htmlFor={`${action.id}-own`} className="cursor-pointer text-[12px]">Own button in the header</label>
      </div>
    </div>
  );
});
