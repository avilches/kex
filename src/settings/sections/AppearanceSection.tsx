import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setExplorerGitColorScheme,
  setUiFont,
  setZoomLevel,
} from "@/modules/settings/store";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { FieldLabel } from "../components/FieldLabel";
import { SectionHeader } from "../components/SectionHeader";

const INPUT_CLASS =
  "h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const UI_FONT_PRESETS: { label: string; value: string }[] = [
  { label: "Default (Inter)", value: "" },
  { label: "Geist Variable", value: "Geist Variable" },
  { label: "DM Sans", value: "DM Sans Variable" },
  { label: "System UI", value: "system-ui" },
  { label: "SF Pro (macOS)", value: "-apple-system, BlinkMacSystemFont" },
  { label: "Helvetica Neue", value: "Helvetica Neue, Helvetica, Arial" },
  { label: "Georgia (serif)", value: "Georgia, serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { label: "Custom...", value: "__custom__" },
];

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.05;

export function AppearanceSection() {
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const uiFont = usePreferencesStore((s) => s.uiFont);

  const isCustom = uiFont !== "" && !UI_FONT_PRESETS.some((p) => p.value === uiFont && p.value !== "__custom__");
  const [showCustomInput, setShowCustomInput] = useState(isCustom);
  const [customValue, setCustomValue] = useState(isCustom ? uiFont : "");

  const selectedPreset = isCustom ? "__custom__" : uiFont;

  function handlePresetChange(value: string) {
    if (value === "__custom__") {
      setShowCustomInput(true);
    } else {
      setShowCustomInput(false);
      void setUiFont(value);
    }
  }

  function handleCustomCommit(value: string) {
    void setUiFont(value);
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Appearance" />

      <div className="flex flex-col gap-2">
        <FieldLabel>UI Font</FieldLabel>
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <select
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className={INPUT_CLASS}
          >
            {UI_FONT_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {showCustomInput && (
            <input
              type="text"
              placeholder="e.g. Nunito, Helvetica Neue"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={(e) => handleCustomCommit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                  handleCustomCommit(customValue);
                }
              }}
              className={INPUT_CLASS}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <span className="text-[12.5px] font-medium">Zoom UI</span>
          <div className="flex items-center gap-2">
            <Slider
              value={[zoomLevel]}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              onValueChange={(v) => void setZoomLevel(v[0] ?? 1)}
              className="w-32"
            />
            <span className="w-9 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              title="Reset to default"
              disabled={zoomLevel === 1.0}
              onClick={() => void setZoomLevel(1.0)}
              className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <HugeiconsIcon icon={Refresh01Icon} size={11} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Explorer</FieldLabel>
        <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <span className="text-[12.5px] font-medium">Git file colors</span>
          <div className="grid grid-cols-2 gap-2">
            {(["vscode", "jetbrains"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void setExplorerGitColorScheme(s)}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-2.5 text-left transition-all",
                  gitColorScheme === s
                    ? "border-foreground/60 ring-1 ring-foreground/20"
                    : "border-border/60 hover:border-border",
                )}
              >
                <span className="text-[12px] font-medium">
                  {s === "vscode" ? "VS Code" : "JetBrains"}
                </span>
                <GitColorPreview scheme={s} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type GitPreviewEntry =
  | { name: string; label: string; color: { vscode: string; jetbrains: string }; kind?: "normal" }
  | { name: string; label: string; kind: "ignored" | "clean" };

const GIT_PREVIEW_ENTRIES: GitPreviewEntry[] = [
  { name: "no_changes.html", label: "",  kind: "clean" },
  { name: "file_modified.ts", label: "M", color: { vscode: "#E2C08D", jetbrains: "#6897BB" } },
  { name: "new_file.rs",   label: "A", color: { vscode: "#81B88B", jetbrains: "#629755" } },
  { name: "untracked.java",  label: "U", color: { vscode: "#73C991", jetbrains: "#C75450" } },
  { name: "deleted.md",    label: "D", color: { vscode: "#C74E39", jetbrains: "#9E9E9E" } },
  { name: "renamed.tsx",   label: "R", color: { vscode: "#73C991", jetbrains: "#6897BB" } },
  { name: "ignored.log",   label: "I", kind: "ignored" },
];

function GitColorPreview({ scheme }: { scheme: "vscode" | "jetbrains" }) {
  return (
    <div className="flex flex-col gap-px">
      {GIT_PREVIEW_ENTRIES.map((entry) => {
        const isIgnored = entry.kind === "ignored";
        const isClean = entry.kind === "clean";
        const color = !isIgnored && !isClean && "color" in entry ? entry.color[scheme] : undefined;
        const iconUrl = fileIconUrl(entry.name);
        return (
          <div key={entry.name} className="flex items-center gap-1.5">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                className={cn("size-4 shrink-0", (isIgnored || isClean) && "opacity-50")}
              />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <span
              className={cn(
                "text-[12px]",
                isIgnored ? "text-muted-foreground/70" : isClean ? "text-foreground/85" : "",
              )}
              style={{
                ...(color ? { color } : {}),
                ...(entry.label === "D" ? { textDecoration: "line-through" } : {}),
              }}
            >
              {entry.name}
            </span>
            <span
              className={cn(
                "ml-auto pl-2 text-[10px] font-semibold tabular-nums",
                isIgnored ? "text-muted-foreground/50" : isClean ? "text-foreground/40" : "",
              )}
              style={color ? { color } : undefined}
            >
              {entry.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
