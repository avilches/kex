import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ACTION_ICON_SIZES } from "@/lib/actionIconSizes";
import { ZOOM_LEVELS } from "@/lib/zoomLevels";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import type { GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  SPINNER_STYLES,
  type SpinnerStyle,
  setActionIconSize,
  setExplorerGitColorScheme,
  setSpinnerStyle,
  setUiFont,
  setZoomLevel,
} from "@/modules/settings/store";
import { useTheme } from "@/modules/theme/ThemeProvider";
import { useEffect, useState } from "react";
import { FieldLabel } from "../components/FieldLabel";
import { INPUT_CLASS } from "../components/inputClass";
import { SectionHeader } from "../components/SectionHeader";
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

export function AppearanceSection() {
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const spinnerStyle = usePreferencesStore((s) => s.spinnerStyle);
  const actionIconSize = usePreferencesStore((s) => s.actionIconSize);
  const uiFont = usePreferencesStore((s) => s.uiFont);
  const hydrated = usePreferencesStore((s) => s.hydrated);

  const isCustom =
    uiFont !== "" &&
    !UI_FONT_PRESETS.some(
      (p) => p.value === uiFont && p.value !== "__custom__",
    );
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
        <FieldLabel>UI</FieldLabel>
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[12.5px] font-medium">Font</span>
              <Select
                value={toSelectValue(selectedPreset)}
                onValueChange={(v) => handlePresetChange(fromSelectValue(v))}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 w-full min-w-0 text-[12.5px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UI_FONT_PRESETS.map((p) => (
                    <SelectItem
                      key={p.value}
                      value={toSelectValue(p.value)}
                      className="text-[12.5px]"
                    >
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[12.5px] font-medium">Zoom</span>
              <RadioGroup
                value={String(zoomLevel)}
                onValueChange={(v) => void setZoomLevel(Number(v))}
                className="flex items-center gap-2"
              >
                {ZOOM_LEVELS.map((z) => (
                  <div key={z} className="flex items-center gap-1.5">
                    <RadioGroupItem value={String(z)} id={`zoom-${z}`} />
                    <label
                      htmlFor={`zoom-${z}`}
                      className="cursor-pointer text-[12px] tabular-nums"
                    >
                      {Math.round(z * 100)}%
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
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
                }
              }}
              className={INPUT_CLASS}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
          <span className="text-[12.5px] font-medium">Action icon size</span>
          <RadioGroup
            value={String(actionIconSize)}
            onValueChange={(v) => void setActionIconSize(Number(v))}
            className="flex items-center gap-2"
          >
            {ACTION_ICON_SIZES.map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <RadioGroupItem value={String(s)} id={`action-icon-${s}`} />
                <label htmlFor={`action-icon-${s}`} className="cursor-pointer text-[12px] tabular-nums">
                  {s}
                </label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
          <span className="text-[12.5px] font-medium">Loading indicator</span>
          <RadioGroup
            value={spinnerStyle}
            onValueChange={(v) => void setSpinnerStyle(v as SpinnerStyle)}
            className="flex items-center gap-2"
          >
            {SPINNER_STYLES.map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <RadioGroupItem value={s} id={`spinner-${s}`} />
                <label
                  htmlFor={`spinner-${s}`}
                  className="flex cursor-pointer items-center gap-1.5 text-[11.5px] font-medium"
                >
                  <Spinner size={12} style={s} />
                  {SPINNER_STYLE_LABELS[s]}
                </label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Explorer</FieldLabel>
        <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <span className="text-[12.5px] font-medium">Git file colors</span>
          <RadioGroup
            value={gitColorScheme}
            onValueChange={(v) =>
              void setExplorerGitColorScheme(v as "vscode" | "jetbrains")
            }
            className="grid grid-cols-2 gap-2"
          >
            {(["vscode", "jetbrains"] as const).map((s) => (
              <label
                key={s}
                htmlFor={`git-colors-${s}`}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-2.5 text-left transition-all",
                  gitColorScheme === s
                    ? "border-foreground/60 ring-1 ring-foreground/20"
                    : "border-border/60 hover:border-border",
                )}
              >
                <span className="flex items-center gap-2 text-[12px] font-medium">
                  <RadioGroupItem value={s} id={`git-colors-${s}`} />
                  {s === "vscode" ? "VS Code" : "JetBrains"}
                </span>
                <GitColorPreview scheme={s} />
              </label>
            ))}
          </RadioGroup>
        </div>
      </div>

      <TitleTemplatesBlock />
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
        const color = entry.label
          ? (gitStatusHexColor(entry.label, scheme, resolvedMode) ?? undefined)
          : undefined;
        const iconUrl = fileIconUrl(entry.name);
        return (
          <div key={entry.name} className="flex items-center gap-1.5">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                className={cn(
                  "size-4 shrink-0",
                  (isIgnored || isClean) && "opacity-50",
                )}
              />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <span
              className={cn(
                "text-[12px]",
                isIgnored
                  ? "text-muted-foreground/70"
                  : isClean
                    ? "text-foreground/85"
                    : "",
              )}
              style={{
                ...(color ? { color } : {}),
                ...(entry.label === "D"
                  ? { textDecoration: "line-through" }
                  : {}),
              }}
            >
              {entry.name}
            </span>
            <span
              className={cn(
                "ml-auto pl-2 text-[10px] font-semibold tabular-nums",
                isIgnored
                  ? "text-muted-foreground/50"
                  : isClean
                    ? "text-foreground/40"
                    : "",
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
