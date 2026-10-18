import { PlusSignIcon } from "@hugeicons/core-free-icons";
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
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { newActionId } from "@/lib/ids";
import { ActionRow, type ActionRowHandle } from "./ActionRow";
import type { AppSuggestion } from "./lib/appSuggestions";
import type { ActionContext } from "./lib/useActionContext";
import type { Action } from "./lib/types";

type Props = {
  /** The saved Actions. Rows with no command yet live only in this editor until they get one. */
  actions: readonly Action[];
  suggestions: readonly AppSuggestion[];
  context: ActionContext | null;
  emptyHint: string;
  /** May return a promise: when it rejects the row stays, as a draft that can be saved again. */
  onAdd: (action: Action) => void | Promise<unknown>;
  onUpdate: (id: string, next: Action) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onMakeGlobal?: (id: string) => void;
};

function blankAction(): Action {
  return { id: newActionId(), name: "", runInTerminal: true, command: "", cwdMode: "workspace", ownButton: false };
}

// One editor for both scopes. A new row is a draft until its command is filled in, because
// an Action with no command is not valid and the stores refuse it; closing the editor
// forgets the drafts, as the old Scripts tab dropped its empty rows.
export function ActionsEditor({
  actions,
  suggestions,
  context,
  emptyHint,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  onMakeGlobal,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [drafts, setDrafts] = useState<Action[]>([]);
  const rows = useRef<Map<string, ActionRowHandle>>(new Map());
  // Drafts already handed to the store, which has not echoed them back yet.
  const handedOver = useRef<Set<string>>(new Set());
  const saved = new Set(actions.map((a) => a.id));
  // A draft stays rendered, under the same key, until the store shows an action with its id,
  // so the row keeps its DOM node and its focus while the write is on its way.
  const visible = [...actions, ...drafts.filter((d) => !saved.has(d.id))];

  const addRow = () => {
    const pending = drafts.find((d) => !d.command.trim());
    if (pending) return void rows.current.get(pending.id)?.focusCommand();
    setDrafts((d) => [...d, blankAction()]);
  };

  const change = (current: Action, next: Action) => {
    if (saved.has(current.id)) {
      onUpdate(current.id, next);
      return;
    }
    setDrafts((d) => d.map((x) => (x.id === current.id ? next : x)));
    if (next.command.trim() && !handedOver.current.has(current.id)) {
      handedOver.current.add(current.id);
      Promise.resolve(onAdd(next)).catch(() => handedOver.current.delete(current.id));
    }
  };

  // Once the store shows a draft, the saved row takes its place and the bookkeeping goes.
  useEffect(() => {
    if (drafts.every((d) => !saved.has(d.id))) return;
    for (const id of saved) handedOver.current.delete(id);
    setDrafts((d) => d.filter((x) => !saved.has(x.id)));
  });

  const remove = (action: Action) => {
    if (saved.has(action.id)) onRemove(action.id);
    else setDrafts((d) => d.filter((x) => x.id !== action.id));
  };

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]" onClick={addRow}>
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          Add Action
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={visible.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div className="flex max-h-[360px] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {visible.map((action) => (
              <ActionRow
                key={action.id}
                ref={(handle) => {
                  if (handle) rows.current.set(action.id, handle);
                  else rows.current.delete(action.id);
                }}
                action={action}
                suggestions={suggestions}
                context={context}
                saved={saved.has(action.id)}
                onMakeGlobal={onMakeGlobal && saved.has(action.id) ? () => onMakeGlobal(action.id) : undefined}
                onChange={(next) => change(action, next)}
                onRemove={() => remove(action)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {visible.length === 0 && <p className="text-[11px] text-muted-foreground">{emptyHint}</p>}
    </div>
  );
}
