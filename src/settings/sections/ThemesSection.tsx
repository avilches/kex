import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ThemePref } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import { deleteCustomTheme, saveCustomTheme } from "@/modules/theme/customThemes";
import { listBuiltinThemes } from "@/modules/theme/themes";
import { validateTheme } from "@/modules/theme/validateTheme";
import { deleteThemeFile, emitThemeEdit } from "@/modules/theme/themeFiles";
import { DEFAULT_THEME_ID } from "@/modules/theme/types";
import {
  ComputerIcon,
  Moon02Icon,
  PlusSignIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMemo, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { NoteTintTuner } from "../components/NoteTintTuner";
import { ThemeTable } from "../components/ThemeTable";

const APPEARANCE_MODES: { id: ThemePref; label: string; icon: typeof ComputerIcon }[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

export function ThemesSection() {
  const { themeId, setThemeId, resolvedMode, customThemes, mode, setMode, resolvedTheme } =
    useTheme();
  const builtinThemes = listBuiltinThemes();
  const themes = useMemo(
    () => [...builtinThemes, ...customThemes],
    [builtinThemes, customThemes],
  );
  const customIds = useMemo(
    () => new Set(customThemes.map((t) => t.id)),
    [customThemes],
  );

  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onCreateTheme = () => {
    void emitThemeEdit({ action: "create" });
    void getCurrentWindow().hide();
  };

  const onEditTheme = (id: string) => {
    void emitThemeEdit({ action: "edit", id });
    void getCurrentWindow().hide();
  };

  const handleThemeFiles = async (files: FileList | null) => {
    setImportError(null);
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const result = validateTheme(parsed);
        if (!result.ok) {
          setImportError(`${file.name}: ${result.error}`);
          return;
        }
        await saveCustomTheme(result.theme);
        setThemeId(result.theme.id);
      } catch (e) {
        setImportError(
          `${file.name}: ${e instanceof Error ? e.message : "failed to read"}`,
        );
        return;
      }
    }
  };

  const onPickThemeFile = () => fileInputRef.current?.click();

  const onRemoveCustomTheme = async (id: string) => {
    if (themeId === id) setThemeId(DEFAULT_THEME_ID);
    await deleteCustomTheme(id);
    void deleteThemeFile(id);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Themes" />

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <span className="text-[12.5px] font-medium">Mode</span>
        <div className="flex items-center gap-1">
          {APPEARANCE_MODES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setMode(o.id)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] transition-all",
                mode === o.id
                  ? "border-foreground/60 bg-card ring-1 ring-foreground/20"
                  : "border-border/60 bg-transparent hover:border-border",
              )}
            >
              <HugeiconsIcon icon={o.icon} size={12} strokeWidth={1.75} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <NoteTintTuner />

      <div
        role="presentation"
        className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          void handleThemeFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-medium">Theme</span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={onCreateTheme}
            >
              <HugeiconsIcon icon={PlusSignIcon} size={11} strokeWidth={2} />
              Create
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onPickThemeFile}
            >
              Import .kex-theme
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".kex-theme,.json,application/json"
            className="hidden"
            onChange={(e) => {
              void handleThemeFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {importError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
            {importError}
          </div>
        ) : null}
        <ThemeTable
          themes={themes}
          themeId={themeId}
          customIds={customIds}
          mode={resolvedMode}
          activeTheme={resolvedTheme}
          onSelectTheme={setThemeId}
          onEditTheme={onEditTheme}
          onRemoveTheme={(id) => void onRemoveCustomTheme(id)}
        />
      </div>
    </div>
  );
}
