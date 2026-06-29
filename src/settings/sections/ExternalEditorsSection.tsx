import { type ReactNode, useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_5.5rem_3.5rem_1.5rem]";
const ALL_GROUPS: EditorGroup[] = ["Text Editors", "VS Code", "JetBrains", "Other IDEs"];
const NOT_INSTALLED_COLLAPSED = 1;

function targetTypeLabel(type: EditorTargetType): string {
  if (type === "workspace") return "Opens in the working root";
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
  { value: "workspace-and-files", label: "Open working root and files too" },
  { value: "workspace-only", label: "Open in the working root only" },
];

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

  function handleToggleDetected(id: string, enabled: boolean) {
    const next = enabled
      ? disabledDetectedEditorIds.filter((d) => d !== id)
      : [...disabledDetectedEditorIds, id];
    void setDisabledDetectedEditorIds(next);
  }

  function handleAddCustom() {
    if (customEditors.some((e) => !e.name.trim() && !e.binary.trim())) return;
    const id = crypto.randomUUID();
    const newEditor: CustomEditor = { id, name: "", binary: "", argsBeforePath: [], targetKind: "file" };
    void setCustomEditors([...customEditors, newEditor]);
  }

  function handleUpdateCustom(
    id: string,
    field: "name" | "binary" | "argsBeforePath",
    value: string | string[],
  ) {
    void setCustomEditors(
      customEditors.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  }

  function handleUpdateCustomTargetKind(id: string, kind: "file" | "workspace") {
    void setCustomEditors(
      customEditors.map((e) => (e.id === id ? { ...e, targetKind: kind } : e)),
    );
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

      {ALL_GROUPS.map((group) => (
        <GroupSection
          key={group}
          group={group}
          detectedIds={detectedIds}
          disabledDetectedEditorIds={disabledDetectedEditorIds}
          onToggle={handleToggleDetected}
          headerExtra={
            group === "Text Editors" ? (
              <div className="mt-1 flex flex-col gap-0.5">
                {TEXT_EDITOR_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
                  >
                    <input
                      type="radio"
                      name="textEditorMode"
                      value={opt.value}
                      checked={textEditorMode === opt.value}
                      onChange={() => handleTextEditorModeChange(opt.value)}
                      className="accent-foreground"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            ) : undefined
          }
        />
      ))}

      {/* Custom tools */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Custom tools
        </h3>

        {customEditors.length > 0 && (
          <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
            <div className={cn("grid gap-2 px-3 py-1.5", COLS)}>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Binary / path</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Opens</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Args</span>
              <span />
            </div>
            {customEditors.map((e) => (
              <div key={e.id} className={cn("grid items-center gap-2 px-3 py-2", COLS)}>
                <input
                  type="text"
                  value={e.name}
                  onChange={(ev) => handleUpdateCustom(e.id, "name", ev.target.value)}
                  placeholder="Name"
                  className="h-7 w-full rounded border border-border bg-transparent px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  type="text"
                  value={e.binary}
                  onChange={(ev) => handleUpdateCustom(e.id, "binary", ev.target.value)}
                  placeholder="/usr/local/bin/editor"
                  className="h-7 w-full rounded border border-border bg-transparent px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <select
                  value={e.targetKind ?? "file"}
                  onChange={(ev) =>
                    handleUpdateCustomTargetKind(e.id, ev.target.value as "file" | "workspace")
                  }
                  className="h-7 w-full rounded border border-border bg-card px-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  title="What to pass to the tool"
                >
                  <option value="file">Current file</option>
                  <option value="workspace">Working root</option>
                </select>
                <input
                  type="text"
                  value={e.argsBeforePath.join(" ")}
                  onChange={(ev) =>
                    handleUpdateCustom(
                      e.id,
                      "argsBeforePath",
                      ev.target.value.split(/\s+/).filter(Boolean),
                    )
                  }
                  placeholder="--wait"
                  className="h-7 w-full rounded border border-border bg-transparent px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  title="Remove"
                  onClick={() => handleDeleteCustom(e.id)}
                  className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-fit gap-1.5 px-2 text-[12px]"
          onClick={handleAddCustom}
          disabled={customEditors.some((e) => !e.name.trim() && !e.binary.trim())}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          Add tool
        </Button>
      </div>
    </div>
  );
}
