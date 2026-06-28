import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setPreferredEditorId, setCustomEditors } from "@/modules/settings/store";
import { useExternalEditors, EditorIcon } from "@/modules/external-editors";
import type { CustomEditor } from "@/modules/external-editors";

export function ExternalEditorsSection() {
  const { detectedEditors, isScanning, scan } = useExternalEditors();
  const preferredEditorId = usePreferencesStore((s) => s.preferredEditorId);
  const customEditors = usePreferencesStore((s) => s.customEditors);

  const allEditors = [...detectedEditors, ...customEditors];

  function handleAddCustom() {
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
    const next = customEditors.filter((e) => e.id !== id);
    void setCustomEditors(next);
    if (preferredEditorId === id) {
      void setPreferredEditorId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[13px] font-medium text-foreground">External Editors</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Choose which editor to open files and folders in.
        </p>
      </div>

      {/* Default editor */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">Default editor</label>
        <Select
          value={preferredEditorId ?? "__none__"}
          onValueChange={(v) => void setPreferredEditorId(v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 w-48 text-[12px]">
            <SelectValue placeholder="Select editor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-[12px]">
              Auto (first detected)
            </SelectItem>
            {allEditors.map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-[12px]">
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Detected editors */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-foreground">Detected editors</span>
          <button
            type="button"
            onClick={scan}
            disabled={isScanning}
            className="flex h-[22px] items-center justify-center gap-1 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            title="Scan for available editors"
          >
            {isScanning ? "Scanning..." : "Scan for available editors"}
          </button>
        </div>
        {detectedEditors.length === 0 && !isScanning && (
          <p className="text-[11.5px] text-muted-foreground">
            No editors detected. Click "Scan" to search for installed editors.
          </p>
        )}
        <div className="space-y-0.5">
          {detectedEditors.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded px-1 py-0.5">
              <EditorIcon id={e.id} />
              <span className="w-28 shrink-0 text-[12px] text-foreground">{e.name}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {e.binary}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom editors */}
      <div className="space-y-2">
        <span className="text-[12px] font-medium text-foreground">Custom editors</span>
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
          className="flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          Add editor
        </button>
      </div>
    </div>
  );
}
