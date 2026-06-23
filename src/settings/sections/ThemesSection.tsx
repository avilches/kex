import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { defaultMonoFontFamily } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_FONT_SIZE_MIN,
  EDITOR_FONT_SIZE_MAX,
  FONT_SIZE_STEP,
  LETTER_SPACING_MIN,
  LETTER_SPACING_MAX,
  LETTER_SPACING_STEP,
  LETTER_SPACING_DEFAULT,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
  TERMINAL_LINE_HEIGHT_DEFAULT,
  EDITOR_LINE_HEIGHT_DEFAULT,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalLetterSpacing,
  setTerminalLineHeight,
  setEditorFontFamily,
  setEditorFontSize,
  setEditorLetterSpacing,
  setEditorLineHeight,
  setZoomLevel,
  setPanelSide,
  setExplorerGitColorScheme,
  setEditorTheme,
  EDITOR_THEME_AUTO,
  EDITOR_THEME_LABELS,
  EDITOR_THEME_MODE,
  EDITOR_THEMES,
} from "@/modules/settings/store";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
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
  Refresh01Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { SliderRow } from "../components/SliderRow";

const APPEARANCE_MODES: { id: ThemePref; label: string; icon: typeof ComputerIcon }[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.05;

export function ThemesSection() {
  const { themeId, setThemeId, resolvedMode, customThemes, mode, setMode } = useTheme();
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

  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalLetterSpacing = usePreferencesStore((s) => s.terminalLetterSpacing);
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalLineHeight = usePreferencesStore((s) => s.terminalLineHeight);
  const editorThemePref = usePreferencesStore((s) => s.editorTheme);
  const editorFontFamily = usePreferencesStore((s) => s.editorFontFamily);
  const editorFontSize = usePreferencesStore((s) => s.editorFontSize);
  const editorLetterSpacing = usePreferencesStore((s) => s.editorLetterSpacing);
  const editorLineHeight = usePreferencesStore((s) => s.editorLineHeight);

  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);
  const panelSide = usePreferencesStore((s) => s.panelSide);
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);

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
      <SectionHeader
        title="Appearance"
        description="Color mode, theme, and zoom."
      />

      <div className="flex flex-col gap-2">
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
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
          <span className="text-[12.5px] font-medium">Sidebar position</span>
          <div className="flex items-center gap-1">
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => void setPanelSide(side)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] transition-all",
                  panelSide === side
                    ? "border-foreground/60 bg-card ring-1 ring-foreground/20"
                    : "border-border/60 bg-transparent hover:border-border",
                )}
              >
                <HugeiconsIcon
                  icon={side === "left" ? SidebarLeftIcon : SidebarRightIcon}
                  size={12}
                  strokeWidth={1.75}
                />
                <span className="capitalize">{side}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Explorer</Label>
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

      <div className="flex flex-col gap-2">
        <Label>Terminal</Label>
        <FontFamilyInput
          value={terminalFontFamily}
          defaultFamily={defaultMonoFontFamily()}
          onChange={(v) => void setTerminalFontFamily(v)}
        />
        <SliderRow
          title="Font size"
          description="Terminal text size."
          value={terminalFontSize}
          min={TERMINAL_FONT_SIZE_MIN}
          max={TERMINAL_FONT_SIZE_MAX}
          step={FONT_SIZE_STEP}
          defaultValue={TERMINAL_FONT_SIZE_DEFAULT}
          format={formatPx}
          onChange={(v) => void setTerminalFontSize(v)}
        />
        <SliderRow
          title="Letter spacing"
          description="Extra horizontal space between characters. Use negative values to tighten Nerd Fonts."
          value={terminalLetterSpacing}
          min={LETTER_SPACING_MIN}
          max={LETTER_SPACING_MAX}
          step={LETTER_SPACING_STEP}
          defaultValue={LETTER_SPACING_DEFAULT}
          format={formatSignedPx}
          onChange={(v) => void setTerminalLetterSpacing(v)}
        />
        <SliderRow
          title="Line height"
          description="Vertical space per row, as a multiple of the font size."
          value={terminalLineHeight}
          min={LINE_HEIGHT_MIN}
          max={LINE_HEIGHT_MAX}
          step={LINE_HEIGHT_STEP}
          defaultValue={TERMINAL_LINE_HEIGHT_DEFAULT}
          format={formatRatio}
          onChange={(v) => void setTerminalLineHeight(v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Editor</Label>
        <FontFamilyInput
          value={editorFontFamily}
          defaultFamily={defaultMonoFontFamily()}
          onChange={(v) => void setEditorFontFamily(v)}
        />
        <SliderRow
          title="Font size"
          description="File editor text size."
          value={editorFontSize}
          min={EDITOR_FONT_SIZE_MIN}
          max={EDITOR_FONT_SIZE_MAX}
          step={FONT_SIZE_STEP}
          defaultValue={EDITOR_FONT_SIZE_DEFAULT}
          format={formatPx}
          onChange={(v) => void setEditorFontSize(v)}
        />
        <SliderRow
          title="Letter spacing"
          description="Extra horizontal space between characters."
          value={editorLetterSpacing}
          min={LETTER_SPACING_MIN}
          max={LETTER_SPACING_MAX}
          step={LETTER_SPACING_STEP}
          defaultValue={LETTER_SPACING_DEFAULT}
          format={formatSignedPx}
          onChange={(v) => void setEditorLetterSpacing(v)}
        />
        <SliderRow
          title="Line height"
          description="Vertical space per row, as a multiple of the font size."
          value={editorLineHeight}
          min={LINE_HEIGHT_MIN}
          max={LINE_HEIGHT_MAX}
          step={LINE_HEIGHT_STEP}
          defaultValue={EDITOR_LINE_HEIGHT_DEFAULT}
          format={formatRatio}
          onChange={(v) => void setEditorLineHeight(v)}
        />
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
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-[12px]">Editor theme</span>
            <span className="text-[11px] text-muted-foreground">
              Syntax colors for the code editor. Auto follows the app theme.
            </span>
          </div>
          <Select
            value={editorThemePref}
            onValueChange={(v) => void setEditorTheme(v as EditorThemePref)}
          >
            <SelectTrigger size="sm" className="h-8 w-44 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EDITOR_THEME_AUTO} className="text-[12px]">
                Auto (match app theme)
              </SelectItem>
              <SelectSeparator />
              {[...EDITOR_THEMES]
                .sort(
                  (a, b) =>
                    (EDITOR_THEME_MODE[a] === resolvedMode ? 0 : 1) -
                    (EDITOR_THEME_MODE[b] === resolvedMode ? 0 : 1),
                )
                .map((id) => (
                  <SelectItem
                    key={id}
                    value={id}
                    disabled={EDITOR_THEME_MODE[id] !== resolvedMode}
                    className="text-[12px]"
                  >
                    {EDITOR_THEME_LABELS[id]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

    </div>
  );
}

function FontFamilyInput({
  value,
  defaultFamily,
  onChange,
}: {
  value: string;
  defaultFamily: string;
  onChange: (v: string) => void;
}) {
  // An empty stored preference means "platform default": show that default
  // verbatim so the user always sees what is actually rendering, and restore it
  // if they clear the field.
  const [draft, setDraft] = useState(value || defaultFamily);

  useEffect(() => {
    setDraft(value || defaultFamily);
  }, [value, defaultFamily]);

  const commit = () => {
    const next = draft.trim();
    if (next === "" || next === defaultFamily) {
      setDraft(defaultFamily);
      if (value !== "") onChange("");
      return;
    }
    setDraft(next);
    if (next !== value) onChange(next);
  };

  const isDefault = value === "";

  return (
    <SettingRow
      title="Font family"
      description='Comma-separated list with per-glyph fallback. Clear it to restore the platform default. Set a Nerd Font (e.g. "MesloLGS NF") first for prompt icons.'
    >
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={draft}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="h-8 w-56 rounded-md border border-border bg-background px-2.5 text-[12px] md:text-[12px] outline-none focus:border-foreground/40 focus-visible:ring-0 focus-visible:border-foreground/40"
        />
        <button
          type="button"
          title="Reset to default"
          disabled={isDefault}
          onClick={() => {
            setDraft(defaultFamily);
            onChange("");
          }}
          className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={11} />
        </button>
      </div>
    </SettingRow>
  );
}

const formatPx = (v: number) => `${v} px`;
const formatSignedPx = (v: number) => `${v > 0 ? "+" : ""}${v} px`;
const formatRatio = (v: number) => v.toFixed(1);

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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
