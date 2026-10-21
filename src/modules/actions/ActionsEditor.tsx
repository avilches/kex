import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { newActionId } from "@/lib/ids";
import { ActionRow, type ActionRowHandle } from "./ActionRow";
import { AddApplicationMenu } from "./AddApplicationMenu";
import { uninstalledSuggestions, type AppSuggestion } from "./lib/appSuggestions";
import type { ActionContext } from "./lib/useActionContext";
import type { Action } from "./lib/types";

type Props = {
  /** The saved Actions. Rows with no command yet live only in this editor until they get one. */
  actions: readonly Action[];
  suggestions: readonly AppSuggestion[];
  context: ActionContext | null;
  emptyHint: string;
  /**
   * May return a promise: when it rejects, a command draft the user was typing keeps its row
   * and can be saved again. A picked app preset has no row and shows the host's toast instead.
   */
  onAdd: (action: Action) => void | Promise<unknown>;
  onUpdate: (id: string, next: Action) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onMoveToGlobal?: (id: string) => void;
  onMoveToWorkspace?: (id: string) => void;
};

// The kind is chosen once, on creation, and a saved row cannot switch it afterwards.
function blankScript(): Action {
  return { id: newActionId(), name: "", runInTerminal: true, command: "", cwdMode: "workspace", ownButton: false };
}

function blankApp(): Action {
  return { id: newActionId(), name: "", runInTerminal: false, command: "", ownButton: false };
}

function actionFromSuggestion(s: AppSuggestion): Action {
  return {
    id: newActionId(),
    name: s.name,
    runInTerminal: false,
    command: s.defaultCommand,
    ...(s.appId ? { appId: s.appId } : {}),
    ownButton: false,
  };
}

// One editor for both scopes. A new command row is a draft until its command is filled in,
// because an Action with no command is not valid and the stores refuse it; closing the
// editor forgets the drafts, as the old Scripts tab dropped its empty rows. An app preset
// arrives with a command, so it is handed straight to the store, and so is an Edit copy of
// an installed preset: Kex-provided actions are read-only, so editing starts from a copy
// with no appId of its own.
export function ActionsEditor({
  actions,
  suggestions,
  context,
  emptyHint,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  onMoveToGlobal,
  onMoveToWorkspace,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [drafts, setDrafts] = useState<Action[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useRef<Map<string, ActionRowHandle>>(new Map());
  // Drafts already handed to the store, which has not echoed them back yet.
  const handedOver = useRef<Set<string>>(new Set());
  // Drafts the user confirmed removing; their unmount flush must not re-add them.
  const removing = useRef<Set<string>>(new Set());
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const saved = new Set(actions.map((a) => a.id));
  // A draft stays rendered, under the same key, until the store shows an action with its id,
  // so the row keeps its DOM node and its focus while the write is on its way.
  const visible = [...actions, ...drafts.filter((d) => !saved.has(d.id))];

  const draftIds = new Set(drafts.map((d) => d.id));

  const toggleRow = (id: string) => {
    setOpenId((open) => (open === id ? null : id));
  };

  const addDraft = (fresh: () => Action) => {
    // With the kind fixed on creation, only a pending empty draft of the same kind is reused.
    const pending = drafts.find((d) => !d.command.trim() && d.runInTerminal === fresh().runInTerminal);
    if (pending) return void rows.current.get(pending.id)?.focusCommand();
    const created = fresh();
    setDrafts((d) => [...d, created]);
    requestAnimationFrame(() => rows.current.get(created.id)?.focusCommand());
  };

  const addCommand = () => addDraft(blankScript);

  const addApplication = (s: AppSuggestion) => {
    if (!s.defaultCommand.trim()) return addDraft(blankApp);
    Promise.resolve(onAddRef.current(actionFromSuggestion(s))).catch(() => {});
  };

  // Edit on an app preset: a copy without the appId, so it is an editable user Action, is
  // handed to the store at once and opens with its command selected.
  const duplicate = (action: Action) => {
    const copy: Action = { ...action, id: newActionId(), appId: undefined };
    setDrafts((d) => [...d, copy]);
    handedOver.current.add(copy.id);
    setOpenId(copy.id);
    Promise.resolve(onAddRef.current(copy)).catch(() => handedOver.current.delete(copy.id));
    requestAnimationFrame(() => rows.current.get(copy.id)?.focusCommand());
  };

  const change = (current: Action, next: Action) => {
    if (removing.current.has(current.id)) return;
    if (saved.has(current.id)) {
      onUpdate(current.id, next);
      return;
    }
    setDrafts((d) => d.map((x) => (x.id === current.id ? next : x)));
    if (next.command.trim() && !handedOver.current.has(current.id)) {
      handedOver.current.add(current.id);
      Promise.resolve(onAddRef.current(next)).catch(() => handedOver.current.delete(current.id));
    }
  };

  // Once the store shows a draft, the saved row takes its place and the bookkeeping goes.
  useEffect(() => {
    if (drafts.every((d) => !saved.has(d.id))) return;
    for (const id of saved) handedOver.current.delete(id);
    setDrafts((d) => d.filter((x) => !saved.has(x.id)));
  });

  const remove = (action: Action) => {
    removing.current.add(action.id);
    if (saved.has(action.id)) onRemove(action.id);
    else setDrafts((d) => d.filter((x) => x.id !== action.id));
  };

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  const availableSuggestions = useMemo(
    () => uninstalledSuggestions(suggestions, actions),
    [suggestions, actions],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]" onClick={addCommand}>
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={12} strokeWidth={2} />
          Add Command
        </Button>
        <AddApplicationMenu suggestions={availableSuggestions} context={context} onPick={addApplication} />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={visible.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div className="flex max-h-[440px] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {visible.map((action) => {
              const isDraft = draftIds.has(action.id);
              return (
              <ActionRow
                key={action.id}
                ref={(handle) => {
                  if (handle) rows.current.set(action.id, handle);
                  else rows.current.delete(action.id);
                }}
                action={action}
                context={context}
                saved={saved.has(action.id)}
                immutable={saved.has(action.id) && action.appId !== undefined}
                expanded={isDraft || openId === action.id}
                onToggleExpand={() => toggleRow(action.id)}
                onMoveToGlobal={onMoveToGlobal && saved?.has(action.id) ? () => onMoveToGlobal(action.id) : undefined}
                onMoveToWorkspace={onMoveToWorkspace && saved?.has(action.id) ? () => onMoveToWorkspace(action.id) : undefined}
                onDuplicate={action.appId !== undefined ? () => duplicate(action) : undefined}
                onChange={(next) => change(action, next)}
                onRemove={() => remove(action)}
              />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {visible.length === 0 && <p className="text-[11px] text-muted-foreground">{emptyHint}</p>}
      <p className="text-[11px] text-muted-foreground">
        Command examples: <span className="font-mono">pnpm dev</span> for a script,{" "}
        <span className="font-mono">pycharm {"{workspace}"}</span> for an app.
        {" "}An app preset is read-only; Edit on it makes a copy you can change.
      </p>
    </div>
  );
}
