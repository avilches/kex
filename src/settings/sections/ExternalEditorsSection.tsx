import { useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Cancel01Icon, PlusSignIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setCustomEditors,
  setDisabledDetectedEditorIds,
} from "@/modules/settings/store";
import { useExternalEditors, EditorIcon, EDITOR_CATALOG } from "@/modules/external-editors";
import type { CustomEditor } from "@/modules/external-editors";
import { SectionHeader } from "../components/SectionHeader";
import { cn } from "@/lib/utils";

export function ExternalEditorsSection() {
  const { isScanning, scan } = useExternalEditors();
  const detectedEditors = usePreferencesStore((s) => s.detectedEditors);
  const disabledDetectedEditorIds = usePreferencesStore((s) => s.disabledDetectedEditorIds);
  const customEditors = usePreferencesStore((s) => s.customEditors);

  const detectedIds = new Set(detectedEditors.map((e) => e.id));

  // Scan on first open if no cached data yet
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
    const newEditor: CustomEditor = { id, name: "", binary: "", argsBeforePath: [] };
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

  function handleDeleteCustom(id: string) {
    void setCustomEditors(customEditors.filter((e) => e.id !== id));
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
        Use the header button to open files or folders in an external editor.
        Select your preferred tool from that button&apos;s dropdown.
      </p>

      {/* Catalog — all known editors */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Editors &amp; IDEs
        </h3>
        <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
          {EDITOR_CATALOG.map((entry) => {
            const isDetected = detectedIds.has(entry.id);
            const isDisabled = disabledDetectedEditorIds.includes(entry.id);
            const isEnabled = isDetected && !isDisabled;

            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  !isDetected && "opacity-40",
                )}
              >
                <EditorIcon id={entry.id} size={18} />
                <span
                  className={cn(
                    "flex-1 text-[12.5px]",
                    !isDetected && "text-muted-foreground",
                  )}
                >
                  {entry.name}
                </span>
                {!isDetected && (
                  <span className="text-[10px] text-muted-foreground">Not installed</span>
                )}
                {isDetected && (
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(v) => handleToggleDetected(entry.id, v)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom tools */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Custom tools
        </h3>

        {customEditors.length > 0 && (
          <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
            {/* Headers */}
            <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-3 px-3 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Name
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Binary / path
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Args
              </span>
              <span />
            </div>
            {customEditors.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[1fr_2fr_auto_auto] items-center gap-3 px-3 py-2"
              >
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
                  className="h-7 w-20 rounded border border-border bg-transparent px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
