import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import type { GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  SPINNER_STYLES,
  type SpinnerStyle,
  setExplorerGitColorScheme,
  setSpinnerStyle,
  setUiFont,
  setZoomLevel,
} from "@/modules/settings/store";
import { useTheme } from "@/modules/theme/ThemeProvider";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { FieldLabel } from "../components/FieldLabel";
import { SectionHeader } from "../components/SectionHeader";
import { INPUT_CLASS } from "../components/inputClass";
import { TitleTemplatesBlock } from "../components/TitleTemplatesBlock";

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

// Radix's Select treats an item value of "" as "no selection" (the trigger
// renders blank instead of the item's label), so the "Default" preset's real
// value ("") is mapped to this sentinel for the Select alone; setUiFont still
// gets the real "" / preset value.
const DEFAULT_FONT_SENTINEL = "__default__";

function toSelectValue(presetValue: string): string {
  return presetValue === "" ? DEFAULT_FONT_SENTINEL : presetValue;
}

function fromSelectValue(selectValue: string): string {
  return selectValue === DEFAULT_FONT_SENTINEL ? "" : selectValue;
}

const SPINNER_STYLE_LABELS: Record<SpinnerStyle, string> = {
  arc: "Arc",
  braille: "Braille",
  cursor: "Cursor",
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.05;

export function AppearanceSection() {
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const spinnerStyle = usePreferencesStore((s) => s.spinnerStyle);
  const uiFont = usePreferencesStore((s) => s.uiFont);
  const hydrated = usePreferencesStore((s) => s.hydrated);

  const isCustom = uiFont !== "" && !UI_FONT_PRESETS.some((p) => p.value === uiFont && p.value !== "__custom__");
  const [showCustomInput, setShowCustomInput] = useState(isCustom);
  const [customValue, setCustomValue] = useState(isCustom ? uiFont : "");

  // Preferences hydrate asynchronously, so a mount before hydration finishes
  // captures the pre-hydration uiFont ("") via the useState initializers
  // above. Resync once the real value is in, or a custom font saved earlier
  // renders as the default preset with no way to see or edit its value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: isCustom/uiFont are read fresh from the store once hydrated flips true, not tracked as their own trigger
  useEffect(() => {
    if (hydrated) {
      setShowCustomInput(isCustom);
      setCustomValue(isCustom ? uiFont : "");
    }
  }, [hydrated]);

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
          <Select
            value={toSelectValue(selectedPreset)}
            onValueChange={(v) => handlePresetChange(fromSelectValue(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-full text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UI_FONT_PRESETS.map((p) => (
                <SelectItem key={p.value} value={toSelectValue(p.value)} className="text-[12.5px]">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
          <span className="text-[12.5px] font-medium">Loading indicator</span>
          <div className="flex items-center gap-1.5">
            {SPINNER_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void setSpinnerStyle(s)}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-2 py-1 transition-colors",
                  spinnerStyle === s
                    ? "border-foreground/60 ring-1 ring-foreground/20"
                    : "border-border/60 hover:border-border",
                )}
              >
                <Spinner size={12} style={s} />
                <span className="text-[11.5px] font-medium">{SPINNER_STYLE_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <TitleTemplatesBlock />

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
  | { name: string; label: GitStatusCode }
  | { name: string; label: ""; kind: "ignored" | "clean" };

const GIT_PREVIEW_ENTRIES: GitPreviewEntry[] = [
  { name: "no_changes.html", label: "", kind: "clean" },
  { name: "file_modified.ts", label: "M" },
  { name: "new_file.rs", label: "A" },
  { name: "untracked.java", label: "U" },
  { name: "deleted.md", label: "D" },
  { name: "renamed.tsx", label: "R" },
  { name: "ignored.log", label: "", kind: "ignored" },
];

function GitColorPreview({ scheme }: { scheme: "vscode" | "jetbrains" }) {
  const { resolvedMode } = useTheme();
  return (
    <div className="flex flex-col gap-px">
      {GIT_PREVIEW_ENTRIES.map((entry) => {
        const kind = "kind" in entry ? entry.kind : undefined;
        const isIgnored = kind === "ignored";
        const isClean = kind === "clean";
        const color =
          entry.label ? gitStatusHexColor(entry.label, scheme, resolvedMode) ?? undefined : undefined;
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
