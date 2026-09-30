import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorTheme,
  setTerminalTheme,
  TERMINAL_THEME_AUTO,
  EDITOR_THEME_AUTO,
  EDITOR_THEME_LABELS,
  EDITOR_THEME_MODE,
  EDITOR_THEMES,
} from "@/modules/settings/store";
import type { EditorThemePref, ThemePref } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import { deleteCustomTheme, saveCustomTheme } from "@/modules/theme/customThemes";
import { listBuiltinThemes } from "@/modules/theme/themes";
import { validateTheme } from "@/modules/theme/validateTheme";
import { deleteThemeFile, emitThemeEdit } from "@/modules/theme/themeFiles";
import { DEFAULT_THEME_ID } from "@/modules/theme/types";
import {
  ComputerIcon,
  Edit02Icon,
  Moon02Icon,
  PlusSignIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { resolvePreviewThemeId } from "@/modules/theme/editorThemePreview";
import { resolveEditorSurface } from "@/modules/theme/resolveEditorSurface";
import {
  resolveTerminalPalette,
  terminalThemeOptions,
} from "@/modules/theme/resolveTerminalTheme";
import { TerminalThemePreview } from "../components/TerminalThemePreview";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

const APPEARANCE_MODES: { id: ThemePref; label: string; icon: typeof ComputerIcon }[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

const EditorThemePreview = lazy(() => import("../components/EditorThemePreview"));

type Choice = { id: string; label: string };

function ChoiceGroup({
  title,
  description,
  options,
  value,
  onSelect,
  onHover,
  children,
}: {
  title: string;
  description: string;
  options: Choice[];
  value: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px]">{title}</span>
        <span className="text-[11px] text-muted-foreground">{description}</span>
      </div>
      <div className="flex flex-wrap gap-1.5" onMouseLeave={() => onHover(null)}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            onMouseEnter={() => onHover(o.id)}
            className={cn(
              "h-7 rounded-md border px-2.5 text-[11.5px] transition-all",
              value === o.id
                ? "border-foreground/60 bg-card ring-1 ring-foreground/20"
                : "border-border/60 bg-transparent hover:border-border",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

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

  const editorThemePref = usePreferencesStore((s) => s.editorTheme);
  const terminalThemePref = usePreferencesStore((s) => s.terminalTheme);
  const [highlightedTerminalTheme, setHighlightedTerminalTheme] = useState<string | null>(null);
  const terminalChoiceOptions = useMemo(
    () => [
      { id: TERMINAL_THEME_AUTO, label: "Auto" },
      ...terminalThemeOptions(themes, resolvedMode).map((o) => ({ id: o.id, label: o.name })),
    ],
    [themes, resolvedMode],
  );
  const editorOptions = useMemo(
    () => [
      { id: EDITOR_THEME_AUTO as string, label: "Auto" },
      ...[...EDITOR_THEMES]
        .filter((id) => EDITOR_THEME_MODE[id] === resolvedMode)
        .map((id) => ({ id: id as string, label: EDITOR_THEME_LABELS[id] })),
    ],
    [resolvedMode],
  );
  const [highlightedEditorTheme, setHighlightedEditorTheme] =
    useState<EditorThemePref | null>(null);

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
        <div className="grid grid-cols-2 gap-2">
          {themes.map((t) => {
            const v =
              t.variants[resolvedMode] ?? t.variants.dark ?? t.variants.light;
            const c = v?.colors;
            const swatchBg = c?.background ?? "var(--background)";
            const swatchFg = c?.foreground ?? "var(--foreground)";
            const swatchAccent = c?.primary ?? c?.accent ?? "var(--accent)";
            const swatchMuted = c?.muted ?? "var(--muted)";
            const selected = themeId === t.id;
            const isCustom = customIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all",
                  selected
                    ? "border-foreground/60 ring-1 ring-foreground/20"
                    : "border-border/60 hover:border-border",
                )}
              >
                <div
                  className="flex h-10 w-14 shrink-0 items-center justify-center gap-1 rounded-md border border-border/40"
                  style={{ background: swatchBg }}
                >
                  <span
                    className="h-5 w-2 rounded-sm"
                    style={{ background: swatchAccent }}
                  />
                  <span
                    className="h-5 w-2 rounded-sm"
                    style={{ background: swatchFg, opacity: 0.7 }}
                  />
                  <span
                    className="h-5 w-2 rounded-sm"
                    style={{ background: swatchMuted }}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] font-medium">
                    {t.name}
                  </span>
                  {t.description ? (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {t.description}
                    </span>
                  ) : null}
                </div>
                {isCustom ? (
                  <span className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <span
                      role="button"
                      aria-label={`Edit ${t.name}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTheme(t.id);
                      }}
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={1.75} />
                    </span>
                    <span
                      role="button"
                      aria-label={`Remove ${t.name}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onRemoveCustomTheme(t.id);
                      }}
                    >
                      ×
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <ChoiceGroup
          title="Editor theme"
          description="Syntax colors for the code editor. Auto follows the app theme."
          options={editorOptions}
          value={editorThemePref}
          onSelect={(v) => void setEditorTheme(v as EditorThemePref)}
          onHover={(v) => setHighlightedEditorTheme(v as EditorThemePref | null)}
        >
          <Suspense fallback={<div className="h-40" />}>
            <EditorThemePreview
              themeId={resolvePreviewThemeId(
                highlightedEditorTheme,
                editorThemePref,
                themeId,
                customThemes,
                resolvedMode,
              )}
              surface={resolveEditorSurface(
                highlightedEditorTheme ?? editorThemePref,
                resolvedTheme,
                resolvedMode,
                () => undefined,
              )}
            />
          </Suspense>
        </ChoiceGroup>
        <ChoiceGroup
          title="Terminal theme"
          description="Colors of the terminal only. Auto follows the app theme."
          options={terminalChoiceOptions}
          value={terminalThemePref}
          onSelect={(v) => void setTerminalTheme(v)}
          onHover={setHighlightedTerminalTheme}
        >
          <TerminalThemePreview
            palette={resolveTerminalPalette(
              highlightedTerminalTheme ?? terminalThemePref,
              resolvedTheme,
              themes,
              resolvedMode,
            )}
          />
        </ChoiceGroup>
      </div>
    </div>
  );
}
