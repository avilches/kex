import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  EDITOR_THEME_AUTO,
  EDITOR_THEME_LABELS,
  isEditorThemeId,
  setEditorTheme,
  setTerminalTheme,
  TERMINAL_THEME_AUTO,
} from "@/modules/settings/store";
import type { EditorThemeId } from "@/modules/settings/store";
import { resolveEditorSurface } from "@/modules/theme/resolveEditorSurface";
import { resolveEditorThemeId } from "@/modules/theme/resolveEditorTheme";
import { paletteOf, resolveTerminalPalette } from "@/modules/theme/resolveTerminalTheme";
import { themeSurfaceInfo, unpairedEditorThemes, type SurfaceInfo } from "@/modules/theme/themeSurfaceInfo";
import type { Theme, ThemeMode } from "@/modules/theme/types";
import { Edit02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HoverCard } from "radix-ui";
import { lazy, Suspense, useMemo, useState } from "react";
import { TerminalThemePreview } from "./TerminalThemePreview";

const EditorThemePreview = lazy(() => import("./EditorThemePreview"));

const COLUMNS = "grid grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)] gap-0";
const PREVIEW_BOX = "h-[84px] overflow-hidden rounded-md";

/** Border around a selected cell; neighbours that are selected too join into one outline. */
function frame(selected: boolean, leftSelected: boolean, rightSelected: boolean) {
  return cn(
    "rounded-lg border border-transparent",
    selected && "border-foreground/50 bg-card/60",
    selected && leftSelected && "rounded-l-none border-l-transparent",
    selected && rightSelected && "rounded-r-none border-r-transparent",
  );
}

type Props = {
  themes: Theme[];
  themeId: string;
  customIds: Set<string>;
  mode: ThemeMode;
  activeTheme: Theme;
  onSelectTheme: (id: string) => void;
  onEditTheme: (id: string) => void;
  onRemoveTheme: (id: string) => void;
};

function Swatch({ theme, mode }: { theme: Theme; mode: ThemeMode }) {
  const c = (theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light)?.colors;
  const chips = [c?.background, c?.primary ?? c?.accent, c?.foreground];
  return (
    <span className="flex shrink-0 gap-0.5">
      {chips.map((color, i) => (
        <i
          key={i}
          className="block h-4 w-[7px] rounded-[2px] border border-border/40"
          style={{ background: color ?? "var(--muted)" }}
        />
      ))}
    </span>
  );
}

function ShellPreview({ theme, mode }: { theme: Theme; mode: ThemeMode }) {
  const c = (theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light)?.colors;
  return (
    <div
      className={cn(PREVIEW_BOX, "border border-border/60 p-2 text-[10.5px] leading-[1.5]")}
      style={{ background: c?.sidebar ?? c?.background, color: c?.foreground }}
    >
      <div style={{ color: c?.primary ?? c?.accent }}>■ Explorer</div>
      <div>■ Source Control</div>
      <div>■ Notes</div>
    </div>
  );
}

function EditorPeek({ id, app, mode }: { id: EditorThemeId; app: Theme; mode: ThemeMode }) {
  return (
    <Suspense fallback={<div className="h-56" />}>
      <EditorThemePreview
        themeId={id}
        surface={resolveEditorSurface(id, app, mode, () => undefined)}
      />
    </Suspense>
  );
}

function Cell({
  info,
  selected,
  frameClass,
  locked,
  onPick,
  preview,
}: {
  info: SurfaceInfo | undefined;
  selected: boolean;
  frameClass: string;
  locked: boolean;
  onPick: () => void;
  preview: React.ReactNode;
}) {
  if (!info) {
    return <div className={cn(frameClass, "px-2 py-1.5 text-[11.5px] text-muted-foreground/60")}>-</div>;
  }
  const shared = info.sharedWith.length > 0;
  return (
    <div className={cn(frameClass, "group/cell flex min-w-0 items-center")}>
      <button
        type="button"
        disabled={locked}
        onClick={onPick}
        title={shared ? `Also used by ${info.sharedWith.join(", ")}` : "Its own"}
        className={cn(
          "flex min-w-0 flex-1 items-center rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors",
          locked ? "cursor-default" : "hover:bg-muted/60",
          locked && !selected && "opacity-50",
        )}
      >
        <span className="truncate">{info.label}</span>
      </button>
      <HoverCard.Root openDelay={150} closeDelay={80}>
        <HoverCard.Trigger asChild>
          <span
            role="img"
            aria-label={`Preview ${info.label}`}
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover/cell:opacity-100"
          >
            <HugeiconsIcon icon={ViewIcon} size={12} strokeWidth={1.75} />
          </span>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content
            side="bottom"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className="z-50 w-[480px] max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-2.5 shadow-xl"
          >
            {preview}
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    </div>
  );
}

export function ThemeTable({
  themes,
  themeId,
  customIds,
  mode,
  activeTheme,
  onSelectTheme,
  onEditTheme,
  onRemoveTheme,
}: Props) {
  const editorPref = usePreferencesStore((s) => s.editorTheme);
  const terminalPref = usePreferencesStore((s) => s.terminalTheme);
  const editorAuto = editorPref === EDITOR_THEME_AUTO;
  const terminalAuto = terminalPref === TERMINAL_THEME_AUTO;

  const [lastEditor, setLastEditor] = useState<string | null>(editorAuto ? null : editorPref);
  const [lastTerminal, setLastTerminal] = useState<string | null>(
    terminalAuto ? null : terminalPref,
  );

  const rows = useMemo(
    () =>
      themes.map((t) => ({
        theme: t,
        info: themeSurfaceInfo(t, themes, mode),
        editorId: resolveEditorThemeId("auto", t.id, themes, mode),
      })),
    [themes, mode],
  );

  const extraEditors = useMemo(() => unpairedEditorThemes(themes, mode), [themes, mode]);

  const activeEditorId = resolveEditorThemeId(editorPref, themeId, themes, mode);

  const toggleEditorAuto = (auto: boolean) => {
    if (auto) {
      if (!editorAuto) setLastEditor(editorPref);
      void setEditorTheme(EDITOR_THEME_AUTO);
    } else {
      const back = lastEditor && isEditorThemeId(lastEditor) ? lastEditor : activeEditorId;
      void setEditorTheme(back);
    }
  };
  const toggleTerminalAuto = (auto: boolean) => {
    if (auto) {
      if (!terminalAuto) setLastTerminal(terminalPref);
      void setTerminalTheme(TERMINAL_THEME_AUTO);
    } else {
      const back = lastTerminal && themes.some((t) => t.id === lastTerminal) ? lastTerminal : themeId;
      void setTerminalTheme(back);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className={cn(COLUMNS, "items-center px-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground")}>
        <span className="px-2">Theme</span>
        <div className="flex items-center justify-between px-2">
          <span>Editor</span>
          <label className="flex items-center gap-1 text-[11px] font-medium normal-case tracking-normal text-foreground/80">
            <Checkbox
              id="editor-auto"
              checked={editorAuto}
              onCheckedChange={(v) => toggleEditorAuto(v === true)}
            />
            Auto
          </label>
        </div>
        <div className="flex items-center justify-between px-2">
          <span>Terminal</span>
          <label className="flex items-center gap-1 text-[11px] font-medium normal-case tracking-normal text-foreground/80">
            <Checkbox
              id="terminal-auto"
              checked={terminalAuto}
              onCheckedChange={(v) => toggleTerminalAuto(v === true)}
            />
            Auto
          </label>
        </div>
      </div>

      <div className={COLUMNS}>
        <div className="flex flex-col gap-1 px-1">
          <span className="px-0.5 text-[11px] font-medium">{activeTheme.name}</span>
          <ShellPreview theme={activeTheme} mode={mode} />
        </div>
        <div className="flex flex-col gap-1 px-1">
          <span className="px-0.5 text-[11px] font-medium">
            {rows.find((r) => r.editorId === activeEditorId)?.info.editor.label ?? activeEditorId}
          </span>
          <div className={cn(PREVIEW_BOX, "border border-border/60 text-[10.5px]")}>
            <Suspense fallback={null}>
              <EditorThemePreview
                themeId={activeEditorId}
                surface={resolveEditorSurface(editorPref, activeTheme, mode, () => undefined)}
              />
            </Suspense>
          </div>
        </div>
        <div className="flex flex-col gap-1 px-1">
          <span className="px-0.5 text-[11px] font-medium">
            {themes.find((t) => t.id === (terminalAuto ? themeId : terminalPref))?.name ??
              activeTheme.name}
          </span>
          <div className={PREVIEW_BOX}>
            <TerminalThemePreview
              palette={resolveTerminalPalette(terminalPref, activeTheme, themes, mode)}
            />
          </div>
        </div>
      </div>

      <div className="flex max-h-[340px] flex-col gap-1 overflow-y-auto pr-0.5">
        {rows.map(({ theme: t, info, editorId }) => {
          const active = t.id === themeId;
          const isCustom = customIds.has(t.id);
          const themeSel = active;
          const editorSel = editorAuto ? active : editorId === editorPref;
          const terminalSel = info.terminal !== undefined && (terminalAuto ? active : t.id === terminalPref);
          return (
            <div key={t.id} className={cn(COLUMNS, "group items-center")}>
              <div className={cn(frame(themeSel, false, editorSel), "flex min-w-0 items-center gap-1")}>
                <button
                  type="button"
                  onClick={() => onSelectTheme(t.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                >
                  <Swatch theme={t} mode={mode} />
                  <span className="truncate text-[12px] font-medium">{t.name}</span>
                </button>
                {isCustom ? (
                  <span className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={`Edit ${t.name}`}
                      className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => onEditTheme(t.id)}
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={11} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${t.name}`}
                      className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                      onClick={() => onRemoveTheme(t.id)}
                    >
                      ×
                    </button>
                  </span>
                ) : null}
              </div>
              <Cell
                info={info.editor}
                selected={editorSel}
                frameClass={frame(editorSel, themeSel, terminalSel)}
                locked={editorAuto}
                onPick={() => {
                  setLastEditor(editorId);
                  void setEditorTheme(editorId);
                }}
                preview={<EditorPeek id={editorId} app={t} mode={mode} />}
              />
              <Cell
                info={info.terminal}
                selected={terminalSel}
                frameClass={frame(terminalSel, editorSel, false)}
                locked={terminalAuto}
                onPick={() => {
                  setLastTerminal(t.id);
                  void setTerminalTheme(t.id);
                }}
                preview={<TerminalThemePreview palette={paletteOf(t, mode)} />}
              />
            </div>
          );
        })}
        {extraEditors.length > 0 ? (
          <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Editor only
          </div>
        ) : null}
        {extraEditors.map((id) => {
          const sel = !editorAuto && id === editorPref;
          return (
            <div key={id} className={cn(COLUMNS, "items-center")}>
              <span className="truncate px-2 text-[12px] text-muted-foreground">-</span>
              <Cell
                info={{ label: EDITOR_THEME_LABELS[id], sharedWith: [] }}
                selected={sel}
                frameClass={frame(sel, false, false)}
                locked={editorAuto}
                onPick={() => {
                  setLastEditor(id);
                  void setEditorTheme(id);
                }}
                preview={<EditorPeek id={id} app={activeTheme} mode={mode} />}
              />
              <span />
            </div>
          );
        })}
      </div>
    </div>
  );
}
