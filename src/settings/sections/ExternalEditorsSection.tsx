import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cancel01Icon, PlusSignIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setCustomEditors,
  setDisabledDetectedEditorIds,
  setTextEditorMode,
  type TextEditorMode,
} from "@/modules/settings/store";
import {
  useExternalEditors,
  EditorIcon,
  EDITOR_CATALOG,
} from "@/modules/external-editors";
import type { CustomEditor, EditorGroup, EditorTargetType } from "@/modules/external-editors";
import { SectionHeader } from "../components/SectionHeader";
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
import { Drag04Icon } from "@hugeicons/core-free-icons";
import type { CSSProperties } from "react";

const ALL_GROUPS: EditorGroup[] = ["Text Editors", "VS Code", "JetBrains", "Other IDEs"];
const NOT_INSTALLED_COLLAPSED = 1;

function targetTypeLabel(type: EditorTargetType): string {
  if (type === "workspace") return "Opens in the workspace root";
  return "Opens the current file";
}

function groupTargetType(group: EditorGroup): EditorTargetType {
  const entry = EDITOR_CATALOG.find((e) => e.group === group);
  return entry?.type ?? "file";
}

function GroupSection({
  group,
  detectedIds,
  disabledDetectedEditorIds,
  onToggle,
  headerExtra,
}: {
  group: EditorGroup;
  detectedIds: Set<string>;
  disabledDetectedEditorIds: string[];
  onToggle: (id: string, enabled: boolean) => void;
  headerExtra?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = EDITOR_CATALOG.filter((e) => e.group === group);
  const installed = all.filter((e) => detectedIds.has(e.id));
  const notInstalled = all.filter((e) => !detectedIds.has(e.id));
  const hidden = Math.max(0, notInstalled.length - NOT_INSTALLED_COLLAPSED);
  const visibleNotInstalled = expanded ? notInstalled : notInstalled.slice(0, NOT_INSTALLED_COLLAPSED);

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {group}
        </h3>
        {headerExtra ?? (
          <p className="text-[10px] text-muted-foreground/60">{targetTypeLabel(groupTargetType(group))}</p>
        )}
      </div>
      <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
        {installed.map((entry) => {
          const isDisabled = disabledDetectedEditorIds.includes(entry.id);
          return (
            <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
              <EditorIcon id={entry.id} size={18} />
              <span className="flex-1 text-[12.5px]">{entry.name}</span>
              <Switch
                checked={!isDisabled}
                onCheckedChange={(v) => onToggle(entry.id, v)}
              />
            </div>
          );
        })}
        {visibleNotInstalled.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 opacity-35">
            <EditorIcon id={entry.id} size={18} />
            <span className="flex-1 text-[12.5px] text-muted-foreground">{entry.name}</span>
          </div>
        ))}
        {!expanded && hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-3 py-2 text-left text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            Show {hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

const TEXT_EDITOR_MODE_OPTIONS: { value: TextEditorMode; label: string }[] = [
  { value: "file-only", label: "Opens single files only" },
  { value: "workspace-and-files", label: "Opens the workspace root and files too" },
];

const INPUT_CLASS =
  "h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const LABEL_CLASS = "text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

function CustomEditorRow({
  editor,
  onUpdate,
  onDelete,
  onRegisterNameRef,
}: {
  editor: CustomEditor;
  onUpdate: (id: string, partial: Partial<Pick<CustomEditor, "name" | "binary" | "argsBeforePath" | "targetKind">>) => void;
  onDelete: (id: string) => void;
  onRegisterNameRef: (id: string, el: HTMLInputElement | null) => void;
}) {
  const [name, setName] = useState(editor.name);
  const [binary, setBinary] = useState(editor.binary);
  const [args, setArgs] = useState(editor.argsBeforePath.join(" "));

  const isIncomplete = !name.trim() || !binary.trim();

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: editor.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-2.5 rounded-lg border bg-card/40 px-3 py-3 ${
        isIncomplete ? "border-destructive/60" : "border-border/60"
      }`}
    >
      {/* Row 1: drag handle + Name + Opens + delete */}
      <div className="flex items-end gap-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          title="Drag to reorder"
          className="mb-[7px] flex size-[22px] shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <HugeiconsIcon icon={Drag04Icon} size={12} strokeWidth={2} />
        </button>
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Name</span>
          <input
            type="text"
            ref={(el) => onRegisterNameRef(editor.id, el)}
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            onBlur={() => onUpdate(editor.id, { name })}
            placeholder="My Tool"
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Opens</span>
          <Select
            value={editor.targetKind ?? "file"}
            onValueChange={(v) =>
              onUpdate(editor.id, { targetKind: v as "file" | "workspace" | "workspace-and-files" })
            }
          >
            <SelectTrigger size="sm" className="h-8 w-full text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="file" className="text-[12px]">Opens single files only</SelectItem>
              <SelectItem value="workspace" className="text-[12px]">Opens workspace root only</SelectItem>
              <SelectItem value="workspace-and-files" className="text-[12px]">Opens workspace root and files too</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          title="Remove"
          onClick={() => onDelete(editor.id)}
          className="mb-[7px] flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
        </button>
      </div>
      {/* Row 2: Command + Args */}
      <div className="flex items-end gap-2">
        {/* spacer aligned with drag handle above */}
        <div className="size-[22px] shrink-0" />
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Command</span>
          <input
            type="text"
            value={binary}
            onChange={(ev) => setBinary(ev.target.value)}
            onBlur={() => onUpdate(editor.id, { binary })}
            placeholder="subl, /usr/local/bin/tool"
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex w-1/2 flex-col gap-1">
          <span className={LABEL_CLASS}>Args</span>
          <input
            type="text"
            value={args}
            onChange={(ev) => setArgs(ev.target.value)}
            onBlur={() =>
              onUpdate(editor.id, { argsBeforePath: args.split(/\s+/).filter(Boolean) })
            }
            placeholder="--wait"
            className={INPUT_CLASS}
          />
        </div>
        {/* spacer aligned with delete button above */}
        <div className="size-[22px] shrink-0" />
      </div>
    </div>
  );
}

export function ExternalEditorsSection() {
  const { isScanning, scan } = useExternalEditors();
  const detectedEditors = usePreferencesStore((s) => s.detectedEditors);
  const disabledDetectedEditorIds = usePreferencesStore((s) => s.disabledDetectedEditorIds);
  const customEditors = usePreferencesStore((s) => s.customEditors);
  const textEditorMode = usePreferencesStore((s) => s.textEditorMode);

  const detectedIds = new Set(detectedEditors.map((e) => e.id));

  const didScanRef = useRef(false);
  useEffect(() => {
    if (!didScanRef.current && detectedEditors.length === 0 && !isScanning) {
      didScanRef.current = true;
      scan();
    }
  }, [detectedEditors.length, isScanning, scan]);

  // Clean up tools left with neither name nor command when the panel unmounts.
  const customEditorsRef = useRef(customEditors);
  useEffect(() => { customEditorsRef.current = customEditors; }, [customEditors]);
  useEffect(() => {
    return () => {
      const latest = customEditorsRef.current;
      const cleaned = latest.filter((e) => e.name.trim() || e.binary.trim());
      if (cleaned.length !== latest.length) void setCustomEditors(cleaned);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const nameInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const handleRegisterNameRef = useCallback(
    (id: string, el: HTMLInputElement | null) => {
      if (el) nameInputRefs.current.set(id, el);
      else nameInputRefs.current.delete(id);
    },
    [],
  );

  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFocusId) return;
    const el = nameInputRefs.current.get(pendingFocusId);
    if (el) {
      el.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, customEditors]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = customEditors.findIndex((e) => e.id === String(active.id));
    const newIndex = customEditors.findIndex((e) => e.id === String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) {
      void setCustomEditors(arrayMove(customEditors, oldIndex, newIndex));
    }
  }

  function handleToggleDetected(id: string, enabled: boolean) {
    const next = enabled
      ? disabledDetectedEditorIds.filter((d) => d !== id)
      : [...disabledDetectedEditorIds, id];
    void setDisabledDetectedEditorIds(next);
  }

  function handleAddCustom() {
    const incomplete = customEditors.find((e) => !e.name.trim() || !e.binary.trim());
    if (incomplete) {
      nameInputRefs.current.get(incomplete.id)?.focus();
      return;
    }
    const id = crypto.randomUUID();
    void setCustomEditors([...customEditors, { id, name: "", binary: "", argsBeforePath: [], targetKind: "file" }]);
    setPendingFocusId(id);
  }

  function handleUpdateCustom(
    id: string,
    partial: Partial<Pick<CustomEditor, "name" | "binary" | "argsBeforePath" | "targetKind">>,
  ) {
    void setCustomEditors(customEditors.map((e) => (e.id === id ? { ...e, ...partial } : e)));
  }

  function handleDeleteCustom(id: string) {
    void setCustomEditors(customEditors.filter((e) => e.id !== id));
  }

  function handleTextEditorModeChange(mode: TextEditorMode) {
    usePreferencesStore.setState({ textEditorMode: mode });
    void setTextEditorMode(mode);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Tools" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-[11px]"
          onClick={scan}
          disabled={isScanning}
        >
          <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
          {isScanning ? "Scanning..." : "Scan"}
        </Button>
      </div>

      <p className="text-[11.5px] text-muted-foreground -mt-2">
        Use the header button to open files or folders in an external tool.
        Select your preferred tool from that button&apos;s dropdown.
      </p>

      {/* Custom tools - shown first */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Custom tools
        </h3>

        {customEditors.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={customEditors.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {customEditors.map((e) => (
                  <CustomEditorRow
                    key={e.id}
                    editor={e}
                    onUpdate={handleUpdateCustom}
                    onDelete={handleDeleteCustom}
                    onRegisterNameRef={handleRegisterNameRef}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-fit gap-1.5 px-2 text-[12px]"
          onClick={handleAddCustom}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          Add tool
        </Button>
      </div>

      {ALL_GROUPS.map((group) => (
        <GroupSection
          key={group}
          group={group}
          detectedIds={detectedIds}
          disabledDetectedEditorIds={disabledDetectedEditorIds}
          onToggle={handleToggleDetected}
          headerExtra={
            group === "Text Editors" ? (
              <RadioGroup
                value={textEditorMode}
                onValueChange={(v) => handleTextEditorModeChange(v as TextEditorMode)}
                className="mt-1.5 gap-1.5"
              >
                {TEXT_EDITOR_MODE_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <RadioGroupItem value={opt.value} id={`text-editor-mode-${opt.value}`} />
                    <label
                      htmlFor={`text-editor-mode-${opt.value}`}
                      className="cursor-pointer text-[12px]"
                    >
                      {opt.label}
                    </label>
                  </div>
                ))}
              </RadioGroup>
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
