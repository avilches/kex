import { Button } from "@/components/ui/button";
import { useTheme } from "@/modules/theme";
import { deleteCustomTheme, saveCustomTheme } from "@/modules/theme/customThemes";
import { listBuiltinThemes } from "@/modules/theme/themes";
import { validateTheme } from "@/modules/theme/validateTheme";
import { deleteThemeFile, emitThemeEdit } from "@/modules/theme/themeFiles";
import { DEFAULT_THEME_ID } from "@/modules/theme/types";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMemo, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { ThemeModeSelector } from "../components/ThemeModeSelector";
import { ThemeTable } from "../components/ThemeTable";

export function ThemesSection() {
  const { themeId, setThemeId, resolvedMode, customThemes, resolvedTheme } = useTheme();
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
      <SectionHeader title="Themes" right={<ThemeModeSelector />} />

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
        <div className="flex items-center justify-end">
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
