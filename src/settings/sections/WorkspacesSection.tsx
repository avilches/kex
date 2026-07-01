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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setRandomWorkspaceColor,
  setWarnOnCloseWorkspace,
  setWorkspaceStatuses,
  type WorkspaceStatus,
} from "@/modules/settings/store";
import { newStatusId } from "@/lib/ids";
import {
  WORKSPACE_COLOR_PALETTE,
  randomStatusColor,
  resolveStatusColor,
} from "@/modules/workspaces/lib/workspaceColor";
import { FieldLabel } from "../components/FieldLabel";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

const INPUT_CLASS =
  "h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function SortableStatusRow({
  index,
  status,
  onUpdate,
  onUpdateColor,
  onRemove,
  inputRef,
}: {
  index: number;
  status: WorkspaceStatus;
  onUpdate: (label: string) => void;
  onUpdateColor: (color: string) => void;
  onRemove: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: status.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const resolvedColor = resolveStatusColor(status.color, status.id);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0">
        <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Change color"
            className="size-[22px] shrink-0 rounded-full border border-border/60 transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ backgroundColor: resolvedColor }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-4 gap-1.5">
            {WORKSPACE_COLOR_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                onClick={() => { onUpdateColor(hex); setOpen(false); }}
                className="size-6 rounded-full border-2 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: hex,
                  borderColor: status.color === hex ? "white" : "transparent",
                  outline: status.color === hex ? `2px solid ${hex}` : "none",
                }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <span className="w-6 shrink-0 text-right text-[11px] text-muted-foreground/60 select-none">
        #{index + 1}
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
  const warnOnCloseWorkspace = usePreferencesStore((s) => s.warnOnCloseWorkspace);
  const randomWorkspaceColor = usePreferencesStore((s) => s.randomWorkspaceColor);
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
      const cleaned = statusesRef.current.filter((s) => s.label?.trim());
      if (cleaned.length !== statusesRef.current.length) {
        void setWorkspaceStatuses(cleaned);
      }
    };
  }, []);

  function persist(next: WorkspaceStatus[]) {
    setStatuses(next);
    void setWorkspaceStatuses(next.filter((s) => s.label?.trim()));
  }

  function handleUpdate(id: string, label: string) {
    persist(statuses.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  function handleUpdateColor(id: string, color: string) {
    persist(statuses.map((s) => (s.id === id ? { ...s, color } : s)));
  }

  function handleRemove(id: string) {
    persist(statuses.filter((s) => s.id !== id));
  }

  function handleAdd() {
    const empty = statuses.find((s) => !s.label?.trim());
    if (empty) {
      inputRefs.current.get(empty.id)?.focus();
      return;
    }
    const next: WorkspaceStatus = { id: newStatusId(), label: "", color: randomStatusColor() };
    const updated = [...statuses, next];
    setStatuses(updated);
    void setWorkspaceStatuses(updated.filter((s) => s.label?.trim()));
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
      <SectionHeader title="Workspace" />

      <div className="flex flex-col gap-2">
        <SettingRow
          title="Warn when closing a workspace"
          description="Confirm before closing a workspace and its tabs."
        >
          <Switch
            checked={warnOnCloseWorkspace}
            onCheckedChange={(v) => void setWarnOnCloseWorkspace(v)}
          />
        </SettingRow>
        <SettingRow
          title="Set a random color to new workspaces"
          description="Assign a color automatically when a new workspace is created."
        >
          <Switch
            checked={randomWorkspaceColor}
            onCheckedChange={(v) => void setRandomWorkspaceColor(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Statuses</FieldLabel>
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
                {statuses.map((status, i) => (
                  <SortableStatusRow
                    key={status.id}
                    index={i}
                    status={status}
                    onUpdate={(label) => handleUpdate(status.id, label)}
                    onUpdateColor={(color) => handleUpdateColor(status.id, color)}
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
    </div>
  );
}
