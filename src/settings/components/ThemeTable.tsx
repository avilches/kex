import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  EDITOR_THEME_AUTO,
  EDITOR_THEME_LABELS,
  setEditorTheme,
  setTerminalTheme,
  setThemeAuto,
  TERMINAL_THEME_AUTO,
} from "@/modules/settings/store";
import type { EditorThemeId } from "@/modules/settings/store";
import { resolveEditorSurface } from "@/modules/theme/resolveEditorSurface";
import { variantNoteSurface } from "@/modules/theme/noteSurface";
import {
  formatEditorRowPref,
  parseEditorRowPref,
  resolveEditorThemeId,
} from "@/modules/theme/resolveEditorTheme";
import {
  formatTerminalPref,
  paletteOf,
  parseTerminalPref,
  resolveTerminalPalette,
} from "@/modules/theme/resolveTerminalTheme";
import {
  surfaceModes,
  themeSurfaceInfo,
  unpairedEditorThemes,
  type SurfaceInfo,
} from "@/modules/theme/themeSurfaceInfo";
import { listTerminalOnlyThemes } from "@/modules/theme/themes";
import type { Theme, ThemeMode } from "@/modules/theme/types";
import { Edit02Icon, Moon02Icon, Sun03Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HoverCard } from "radix-ui";
import { Fragment, lazy, Suspense, useMemo, useState } from "react";
import { TerminalThemePreview } from "./TerminalThemePreview";

const EditorThemePreview = lazy(() => import("./EditorThemePreview"));

const COLUMNS = "grid grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)] gap-0";
const PREVIEW_BOX = "h-[84px] overflow-hidden rounded-md";

const CELL = "relative rounded-lg";
const FIRST_COLUMN = "170px";
const ICON_BUTTON =
  "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground";

const otherMode = (mode: ThemeMode): ThemeMode => (mode === "dark" ? "light" : "dark");

function columnLeft(i: number) {
  if (i === 0) return "0px";
  if (i === 1) return FIRST_COLUMN;
  return `calc(${FIRST_COLUMN} + (100% - ${FIRST_COLUMN}) / 2)`;
}

function columnWidth(from: number, to: number) {
  const side = `(100% - ${FIRST_COLUMN}) / 2`;
  const firstColumn = from === 0 ? 1 : 0;
  const sides = to - from - firstColumn;
  return `calc(${firstColumn ? FIRST_COLUMN : "0px"} + ${sides} * ${side})`;
}

/**
 * One outline per run of adjacent selected cells, so joined cells share a
 * single border. The border sits above the cells so a hover shade never hides it.
 */
function SelectionOutline({ selected }: { selected: boolean[] }) {
  const runs: [number, number][] = [];
  selected.forEach((on, i) => {
    if (!on) return;
    const last = runs[runs.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else runs.push([i, i + 1]);
  });
  return (
    <>
      {runs.map(([from, to]) => {
        const style = { left: columnLeft(from), width: columnWidth(from, to) };
        return (
          <Fragment key={from}>
            <div
              className="pointer-events-none absolute inset-y-0 rounded-lg bg-card/60"
              style={style}
            />
            <div
              className="pointer-events-none absolute inset-y-0 z-10 rounded-lg border border-foreground/50"
              style={style}
            />
          </Fragment>
        );
      })}
    </>
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
  const variant = theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light;
  const c = variant?.colors;
  const note = variant ? variantNoteSurface(variant) : null;
  return (
    <div
      className={cn(PREVIEW_BOX, "border border-border/60 p-2 text-[10.5px] leading-[1.5]")}
      style={{ background: c?.sidebar ?? c?.background, color: c?.foreground }}
    >
      <div style={{ color: c?.primary ?? c?.accent }}>■ Explorer</div>
      <div>■ Source Control</div>
      {note ? (
        <div
          className="mt-1 truncate rounded-[4px] border px-1.5 py-0.5"
          style={{ background: note.background, color: note.foreground, borderColor: `${note.foreground}30` }}
        >
          <span className="font-semibold">Note:</span> Rebase before the release
        </div>
      ) : (
        <div>■ Notes</div>
      )}
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

type ModeToggle = { shown: ThemeMode; flipped: boolean; onToggle: () => void };

function Cell({
  info,
  onPick,
  preview,
  modeToggle,
  onHover,
}: {
  info: SurfaceInfo | undefined;
  onPick: () => void;
  preview: React.ReactNode;
  modeToggle?: ModeToggle;
  onHover?: (on: boolean) => void;
}) {
  if (!info) {
    return <div className={cn(CELL, "px-2 py-1.5 text-[11.5px] text-muted-foreground/60")}>-</div>;
  }
  const shared = info.sharedWith.length > 0;
  return (
    <div
      className={cn(CELL, "group/cell flex min-w-0 items-center")}
      onMouseEnter={onHover && (() => onHover(true))}
      onMouseLeave={onHover && (() => onHover(false))}
    >
      <button
        type="button"
        onClick={onPick}
        title={shared ? `Also used by ${info.sharedWith.join(", ")}` : "Its own"}
        className="flex min-w-0 flex-1 items-center rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-muted/60"
      >
        <span className="truncate">{info.label}</span>
      </button>
      {modeToggle ? (
        <button
          type="button"
          onClick={modeToggle.onToggle}
          title={
            modeToggle.shown === "dark"
              ? "Showing the dark variant, click for light"
              : "Showing the light variant, click for dark"
          }
          aria-label="Switch between the dark and the light variant"
          className={cn(
            ICON_BUTTON,
            modeToggle.flipped ? "opacity-100" : "opacity-0 group-hover/cell:opacity-100",
          )}
        >
          <HugeiconsIcon
            icon={modeToggle.shown === "dark" ? Moon02Icon : Sun03Icon}
            size={12}
            strokeWidth={1.75}
          />
        </button>
      ) : null}
      <HoverCard.Root openDelay={150} closeDelay={80}>
        <HoverCard.Trigger asChild>
          <span
            role="img"
            aria-label={`Preview ${info.label}`}
            className={cn(ICON_BUTTON, "mr-1 opacity-0 group-hover/cell:opacity-100")}
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
  const themeAuto = usePreferencesStore((s) => s.themeAuto);
  const editorAuto = editorPref === EDITOR_THEME_AUTO;
  const terminalAuto = terminalPref === TERMINAL_THEME_AUTO;
  const pinnedTerminal = terminalAuto ? undefined : parseTerminalPref(terminalPref);
  const editorRowPref = parseEditorRowPref(editorPref);

  const [pickedEditorRow, setPickedEditorRow] = useState<string | null>(null);
  const [hoverTheme, setHoverTheme] = useState<Theme | null>(null);
  const [hoverEditor, setHoverEditor] = useState<{
    id: EditorThemeId;
    app: Theme;
    mode: ThemeMode;
  } | null>(null);
  const [hoverTerminal, setHoverTerminal] = useState<{
    name: string;
    mode: ThemeMode;
    palette: ReturnType<typeof paletteOf>;
  } | null>(null);
  const base = useMemo(
    () =>
      themes.map((t) => ({
        theme: t,
        modes: surfaceModes(t),
        editorIds: {
          dark: resolveEditorThemeId("auto", t.id, themes, "dark"),
          light: resolveEditorThemeId("auto", t.id, themes, "light"),
        },
      })),
    [themes],
  );

  const editorRowId = useMemo(() => {
    if (editorAuto) return themeId;
    if (editorRowPref) return editorRowPref.id;
    const matching = base
      .filter((b) => b.editorIds.dark === editorPref || b.editorIds.light === editorPref)
      .map((b) => b.theme.id);
    if (pickedEditorRow && matching.includes(pickedEditorRow)) return pickedEditorRow;
    return matching.includes(themeId) ? themeId : matching[0];
  }, [base, editorAuto, editorPref, editorRowPref, pickedEditorRow, themeId]);

  const terminalRowId = pinnedTerminal ? pinnedTerminal.id : themeId;

  const rows = useMemo(
    () =>
      base.map((b) => {
        const t = b.theme;
        const editorSel = t.id === editorRowId;
        const terminalSel = t.id === terminalRowId;
        const editorMode = !b.modes.editor
          ? mode
          : editorSel
            ? editorRowPref
              ? (editorRowPref.mode ?? mode)
              : editorAuto || b.editorIds[mode] === editorPref
                ? mode
                : otherMode(mode)
            : mode;
        const terminalMode = !b.modes.terminal
          ? mode
          : terminalSel
            ? (pinnedTerminal?.mode ?? mode)
            : mode;
        return {
          theme: t,
          modes: b.modes,
          editorSel,
          terminalSel,
          editorMode,
          terminalMode,
          editorId: b.editorIds[editorMode],
          editorInfo: themeSurfaceInfo(t, themes, editorMode).editor,
          terminalInfo: themeSurfaceInfo(t, themes, terminalMode).terminal,
        };
      }),
    [
      base,
      themes,
      mode,
      editorRowId,
      terminalRowId,
      editorAuto,
      editorPref,
      editorRowPref,
      pinnedTerminal?.mode,
    ],
  );

  const extraEditors = useMemo(() => unpairedEditorThemes(themes), [themes]);
  const terminalOnly = useMemo(listTerminalOnlyThemes, []);
  const terminalCatalog = useMemo(() => [...themes, ...terminalOnly], [themes, terminalOnly]);

  const activeEditorId = resolveEditorThemeId(editorPref, themeId, themes, mode);

  const followAppTheme = () => {
    void setEditorTheme(EDITOR_THEME_AUTO);
    void setTerminalTheme(TERMINAL_THEME_AUTO);
  };

  const toggleAuto = (auto: boolean) => {
    void setThemeAuto(auto);
    if (auto) followAppTheme();
  };

  const selectTheme = (id: string) => {
    onSelectTheme(id);
    if (themeAuto) followAppTheme();
  };

  const terminalPreviewName = terminalCatalog.find(
    (t) => t.id === (pinnedTerminal ? pinnedTerminal.id : themeId),
  )?.name;

  return (
    <div className="flex flex-col gap-2.5">
      <div className={cn(COLUMNS, "items-center px-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground")}>
        <span />
        <span className="px-2">Editor</span>
        <span className="px-2">Terminal</span>
      </div>

      <div className={COLUMNS}>
        <div className="flex flex-col gap-1 px-1">
          <span className="px-0.5 text-[11px] font-medium">
            {(hoverTheme ?? activeTheme).name}
          </span>
          <ShellPreview theme={hoverTheme ?? activeTheme} mode={mode} />
          <label className="flex items-center gap-1.5 px-0.5 pt-1 text-[11px] font-medium text-foreground/80">
            <Checkbox
              id="theme-auto"
              checked={themeAuto}
              onCheckedChange={(v) => toggleAuto(v === true)}
            />
            Auto
          </label>
        </div>
        <div className="flex flex-col gap-1 px-1">
          <span className="px-0.5 text-[11px] font-medium">
            {EDITOR_THEME_LABELS[hoverEditor?.id ?? activeEditorId]}
          </span>
          <div className={cn(PREVIEW_BOX, "border border-border/60 text-[10.5px]")}>
            <Suspense fallback={null}>
              <EditorThemePreview
                themeId={hoverEditor?.id ?? activeEditorId}
                surface={
                  hoverEditor
                    ? resolveEditorSurface(hoverEditor.id, hoverEditor.app, hoverEditor.mode, () => undefined)
                    : resolveEditorSurface(
                        editorRowPref ? activeEditorId : editorPref,
                        activeTheme,
                        mode,
                        () => undefined,
                      )
                }
              />
            </Suspense>
          </div>
        </div>
        <div className="flex flex-col gap-1 px-1">
          <span className="px-0.5 text-[11px] font-medium">
            {hoverTerminal ? hoverTerminal.name : (terminalPreviewName ?? activeTheme.name)}
            {hoverTerminal
              ? hoverTerminal.mode !== mode
                ? ` (${hoverTerminal.mode})`
                : ""
              : pinnedTerminal?.mode && pinnedTerminal.mode !== mode
                ? ` (${pinnedTerminal.mode})`
                : ""}
          </span>
          <div className={PREVIEW_BOX}>
            <TerminalThemePreview
              palette={
                hoverTerminal
                  ? hoverTerminal.palette
                  : resolveTerminalPalette(terminalPref, activeTheme, terminalCatalog, mode)
              }
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {rows.map((r) => {
          const t = r.theme;
          const active = t.id === themeId;
          const isCustom = customIds.has(t.id);
          const themeSel = active;
          const editorSel = r.editorSel;
          const terminalSel = r.terminalSel && r.terminalInfo !== undefined;
          return (
            <div key={t.id} className={cn(COLUMNS, "group relative items-stretch")}>
              <SelectionOutline selected={[themeSel, editorSel, terminalSel]} />
              <div
                className={cn(CELL, "flex min-w-0 items-center gap-1")}
                onMouseEnter={() => setHoverTheme(t)}
                onMouseLeave={() => setHoverTheme(null)}
              >
                <button
                  type="button"
                  onClick={() => selectTheme(t.id)}
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
                info={r.editorInfo}
                onPick={() => {
                  if (themeAuto) return selectTheme(t.id);
                  setPickedEditorRow(t.id);
                  void setEditorTheme(
                    formatEditorRowPref(t.id, r.editorMode === mode ? undefined : r.editorMode),
                  );
                }}
                preview={<EditorPeek id={r.editorId} app={t} mode={r.editorMode} />}
                onHover={(on) =>
                  setHoverEditor(on ? { id: r.editorId, app: t, mode: r.editorMode } : null)
                }
                modeToggle={
                  r.modes.editor && editorSel
                    ? {
                        shown: r.editorMode,
                        flipped: r.editorMode !== mode,
                        onToggle: () => {
                          const next = otherMode(r.editorMode);
                          setPickedEditorRow(t.id);
                          void setEditorTheme(
                            formatEditorRowPref(t.id, next === mode ? undefined : next),
                          );
                        },
                      }
                    : undefined
                }
              />
              <Cell
                info={r.terminalInfo}
                onPick={() => {
                  if (themeAuto) return selectTheme(t.id);
                  void setTerminalTheme(
                    formatTerminalPref(t.id, r.terminalMode === mode ? undefined : r.terminalMode),
                  );
                }}
                preview={<TerminalThemePreview palette={paletteOf(t, r.terminalMode)} />}
                onHover={(on) =>
                  setHoverTerminal(
                    on ? { name: t.name, mode: r.terminalMode, palette: paletteOf(t, r.terminalMode) } : null,
                  )
                }
                modeToggle={
                  r.modes.terminal && terminalSel
                    ? {
                        shown: r.terminalMode,
                        flipped: r.terminalMode !== mode,
                        onToggle: () => {
                          const next = otherMode(r.terminalMode);
                          void setTerminalTheme(
                            formatTerminalPref(t.id, next === mode ? undefined : next),
                          );
                        },
                      }
                    : undefined
                }
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
            <div key={id} className={cn(COLUMNS, "relative items-stretch")}>
              <SelectionOutline selected={[false, sel, false]} />
              <span className="truncate px-2 text-[12px] text-muted-foreground">-</span>
              <Cell
                info={{ label: EDITOR_THEME_LABELS[id], sharedWith: [] }}
                onPick={() => {
                  void setEditorTheme(id);
                }}
                preview={<EditorPeek id={id} app={activeTheme} mode={mode} />}
                onHover={(on) => setHoverEditor(on ? { id, app: activeTheme, mode } : null)}
              />
              <span />
            </div>
          );
        })}
        {terminalOnly.length > 0 ? (
          <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Terminal only
          </div>
        ) : null}
        {terminalOnly.map((t) => {
          const sel = pinnedTerminal?.id === t.id;
          const shown = sel ? (pinnedTerminal.mode ?? mode) : mode;
          return (
            <div key={t.id} className={cn(COLUMNS, "relative items-stretch")}>
              <SelectionOutline selected={[false, false, sel]} />
              <span className="truncate px-2 text-[12px] text-muted-foreground">-</span>
              <span />
              <Cell
                info={{ label: t.name, sharedWith: [] }}
                onPick={() => {
                  void setTerminalTheme(formatTerminalPref(t.id, shown === mode ? undefined : shown));
                }}
                preview={<TerminalThemePreview palette={paletteOf(t, shown)} />}
                onHover={(on) =>
                  setHoverTerminal(on ? { name: t.name, mode: shown, palette: paletteOf(t, shown) } : null)
                }
                modeToggle={
                  sel
                    ? {
                        shown,
                        flipped: shown !== mode,
                        onToggle: () => {
                          const next = otherMode(shown);
                          void setTerminalTheme(formatTerminalPref(t.id, next === mode ? undefined : next));
                        },
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
