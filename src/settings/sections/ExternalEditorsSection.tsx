import { useEffect, useRef, useState } from "react";
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setCustomEditors } from "@/modules/settings/store";
import { useExternalEditors, EditorIcon } from "@/modules/external-editors";
import type { CustomEditor, DetectedEditor } from "@/modules/external-editors";

export function ExternalEditorsSection() {
  const { detectedEditors, isScanning, scan } = useExternalEditors();
  const customEditors = usePreferencesStore((s) => s.customEditors);

  // Detected editors that the user manually removed this session
  const [hiddenDetectedIds, setHiddenDetectedIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Scan on mount if cache is empty (Settings webview misses the startup scan)
  useEffect(() => {
    if (detectedEditors.length === 0 && !isScanning) {
      scan();
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear hidden list when a new scan completes
  const prevScanningRef = useRef(isScanning);
  useEffect(() => {
    if (prevScanningRef.current && !isScanning) {
      setHiddenDetectedIds(new Set());
    }
    prevScanningRef.current = isScanning;
  });

  const visibleDetected = detectedEditors.filter((e) => !hiddenDetectedIds.has(e.id));

  function handleDeleteDetected(e: DetectedEditor) {
    setHiddenDetectedIds((prev) => new Set([...prev, e.id]));
  }

  function handleAddCustom() {
    // Block adding if there's already an editor with both name and binary empty
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
    <div className="space-y-6">
      <div>
        <h2 className="text-[13px] font-medium text-foreground">External Editors</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Use the header button to open files or folders in an external editor.
          Select your preferred editor from that button's dropdown.
        </p>
      </div>

      {/* Detected editors */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-foreground">Detected editors</span>
          <button
            type="button"
            onClick={scan}
            disabled={isScanning}
            className="flex h-[26px] items-center gap-1.5 rounded border border-border bg-muted px-3 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isScanning ? "Scanning..." : "Scan"}
          </button>
        </div>
        {visibleDetected.length === 0 && !isScanning && (
          <p className="text-[11.5px] text-muted-foreground">
            No editors detected. Click Scan to search for installed editors.
          </p>
        )}
        {isScanning && (
          <p className="text-[11.5px] text-muted-foreground">Scanning for editors...</p>
        )}
        <div className="space-y-0.5">
          {visibleDetected.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded px-1 py-1">
              <EditorIcon id={e.id} size={18} />
              <span className="w-28 shrink-0 text-[12px] text-foreground">{e.name}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {e.binary}
              </span>
              <button
                type="button"
                title="Remove from list"
                onClick={() => handleDeleteDetected(e)}
                className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Custom editors */}
      <div className="space-y-2">
        <span className="text-[12px] font-medium text-foreground">Custom editors</span>
        {customEditors.length > 0 && (
          <div className="mb-1 grid grid-cols-[1fr_2fr_auto_auto] gap-2 px-1">
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
        )}
        <div className="space-y-1">
          {customEditors.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <input
                type="text"
                value={e.name}
                onChange={(ev) => handleUpdateCustom(e.id, "name", ev.target.value)}
                placeholder="Name"
                className="h-7 w-28 shrink-0 rounded border border-border bg-transparent px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={e.binary}
                onChange={(ev) => handleUpdateCustom(e.id, "binary", ev.target.value)}
                placeholder="/usr/local/bin/editor"
                className="h-7 min-w-0 flex-1 rounded border border-border bg-transparent px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                className="h-7 w-24 shrink-0 rounded border border-border bg-transparent px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={customEditors.some((e) => !e.name.trim() && !e.binary.trim())}
          className="flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          Add editor
        </button>
      </div>
    </div>
  );
}
