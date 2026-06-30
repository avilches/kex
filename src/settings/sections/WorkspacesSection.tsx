import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cancel01Icon, DragDropVerticalIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setWorkspaceStatuses, type WorkspaceStatus } from "@/modules/settings/store";
import { newStatusId } from "@/lib/ids";
import { SectionHeader } from "../components/SectionHeader";

const INPUT_CLASS =
  "h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function SortableStatusRow({
  status,
  onUpdate,
  onRemove,
  inputRef,
}: {
  status: WorkspaceStatus;
  onUpdate: (label: string) => void;
  onRemove: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: status.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0">
        <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
      </span>
      <input
        ref={inputRef}
        className={INPUT_CLASS}
        placeholder="Status name"
        spellCheck={false}
        defaultValue={status.label}
        onBlur={(e) => onUpdate(e.target.value)}
      />
      <button
        type="button"
        title="Remove status"
        onClick={onRemove}
        className="size-[22px] shrink-0 flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
      </button>
    </div>
  );
}

export function WorkspacesSection() {
  const stored = usePreferencesStore((s) => s.workspaceStatuses);
  const [statuses, setStatuses] = useState<WorkspaceStatus[]>(stored);
  const statusesRef = useRef(statuses);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  useEffect(() => {
    return () => {
      const cleaned = statusesRef.current.filter((s) => s.label.trim());
      if (cleaned.length !== statusesRef.current.length) {
        void setWorkspaceStatuses(cleaned);
      }
    };
  }, []);

  function persist(next: WorkspaceStatus[]) {
    setStatuses(next);
    void setWorkspaceStatuses(next);
  }

  function handleUpdate(id: string, label: string) {
    persist(statuses.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  function handleRemove(id: string) {
    persist(statuses.filter((s) => s.id !== id));
  }

  function handleAdd() {
    const empty = statuses.find((s) => !s.label.trim());
    if (empty) {
      inputRefs.current.get(empty.id)?.focus();
      return;
    }
    const next: WorkspaceStatus = { id: newStatusId(), label: "" };
    const updated = [...statuses, next];
    setStatuses(updated);
    void setWorkspaceStatuses(updated);
    requestAnimationFrame(() => {
      inputRefs.current.get(next.id)?.focus();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = statuses.findIndex((s) => s.id === active.id);
    const to = statuses.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;
    persist(arrayMove(statuses, from, to));
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Workspaces" />

      <div className="flex flex-col gap-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={statuses.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1.5">
              {statuses.map((status) => (
                <SortableStatusRow
                  key={status.id}
                  status={status}
                  onUpdate={(label) => handleUpdate(status.id, label)}
                  onRemove={() => handleRemove(status.id)}
                  inputRef={(el) => {
                    if (el) inputRefs.current.set(status.id, el);
                    else inputRefs.current.delete(status.id);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-fit gap-1.5 px-2 text-[12px]"
            onClick={handleAdd}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
            Add status
          </Button>
        </div>
      </div>
    </div>
  );
}
