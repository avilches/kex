import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import { DocumentCodeIcon, EyeIcon, LayoutTwoColumnIcon, MoreHorizontalIcon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  clampColumnRuler,
  clampIndentSize,
  EDITOR_COLUMN_RULER_MAX,
  EDITOR_INDENT_MAX,
  EDITOR_INDENT_MIN,
  type EditorViewSettings,
} from "./lib/editorViewSettings";
import { EditorPathBreadcrumb } from "./EditorPathBreadcrumb";
import { LANGUAGES } from "./lib/languageDefinitions";
import { resolveDisplayName } from "./lib/languageResolver";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useState } from "react";

export type EditorGlobalToggleKey =
  | "autoSave"
  | "scrollPastEnd"
  | "bracketMatching"
  | "closeBrackets"
  | "autocompletion";

export type EditorGlobalToggles = Record<EditorGlobalToggleKey, boolean>;

// Order mirrors the Settings window Editor group.
const GLOBAL_TOGGLE_LABELS: [EditorGlobalToggleKey, string][] = [
  ["autoSave", "Auto save"],
  ["scrollPastEnd", "Scroll past end"],
  ["bracketMatching", "Bracket matching"],
  ["closeBrackets", "Auto close brackets"],
  ["autocompletion", "Autocompletion"],
];

type Props = {
  path: string;
  workspaceRoot: string | null;
  home: string | null;
  gitRootPath?: string | null;
  onRevealPath: (path: string) => void;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
  view?: {
    mode: "raw" | "overlay" | "split";
    onToggleOverlay: () => void;
    onToggleSplit?: () => void;
    isHtml?: boolean;
  };
  viewToggles?: {
    ext: string;
    value: EditorViewSettings;
    onChange: (next: EditorViewSettings) => void;
    onViewInSettings?: () => void;
  };
  globalToggles?: {
    value: EditorGlobalToggles;
    onToggle: (key: EditorGlobalToggleKey, value: boolean) => void;
  };
  overrideLanguage?: string | null;
  currentLanguageName?: string;
  onLanguageChange?: (lang: string | null) => void;
};

export function EditorPathBar({
  path,
  workspaceRoot,
  home,
  gitRootPath,
  onRevealPath,
  onSetAsRoot,
  onNewWorkspaceFromFolder,
  onRevealInTerminal,
  onAddToGitignore,
  view,
  viewToggles,
  globalToggles,
  overrideLanguage,
  currentLanguageName,
  onLanguageChange,
}: Props) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const shortcutId = view?.isHtml ? "editor.html.toggleView" : "editor.markdown.toggleView";
  const toggleLabel = view ? getShortcutLabel(shortcutId, userShortcuts) : null;
  const showToggles = !!viewToggles;
  const onToggleSplit = view?.onToggleSplit;
  const v = viewToggles?.value;
  const set = (patch: Partial<EditorViewSettings>) => {
    if (!viewToggles || !v) return;
    viewToggles.onChange({ ...v, ...patch });
  };
  const extLabel = viewToggles?.ext ? `.${viewToggles.ext}` : "this file type";
  // Radix closes the menu on every item select; keep it open so several
  // toggles can be flipped in one pass.
  const keepOpen = (e: Event) => e.preventDefault();
  const [langOpen, setLangOpen] = useState(false);
  const selectableLanguages = LANGUAGES.filter((l) => l.userSelectable !== false);

  // Language picker entries. The active one (override, or the by-extension auto
  // language when none) is pinned first with a check; the auto-detected language
  // carries an "(auto)" suffix and otherwise keeps its natural list position.
  const autoName = resolveDisplayName(path);
  const autoLang = selectableLanguages.find((l) => l.name === autoName);
  const overrideLang = overrideLanguage
    ? selectableLanguages.find(
        (l) =>
          l.extensions[0] === overrideLanguage ||
          l.extensions.includes(overrideLanguage),
      )
    : undefined;
  const activeId = overrideLanguage
    ? (overrideLang?.extensions[0] ?? overrideLanguage)
    : "auto";
  const langEntries = (() => {
    const base = selectableLanguages.map((l) =>
      l === autoLang
        ? {
            id: "auto",
            label: l.name,
            searchValue: `auto ${l.name}`,
            isAuto: true,
            active: activeId === "auto",
            select: () => onLanguageChange?.(null),
          }
        : {
            id: l.extensions[0],
            label: l.name,
            searchValue: l.name,
            isAuto: false,
            active: activeId === l.extensions[0],
            select: () => onLanguageChange?.(l.extensions[0]),
          },
    );
    if (!autoLang) {
      base.unshift({
        id: "auto",
        label: autoName,
        searchValue: `auto ${autoName}`,
        isAuto: true,
        active: activeId === "auto",
        select: () => onLanguageChange?.(null),
      });
    }
    const active = base.find((e) => e.id === activeId);
    const auto = base.find((e) => e.id === "auto");
    const rest = base.filter((e) => e.id !== activeId && e.id !== "auto");
    const ordered = [];
    if (auto) ordered.push(auto);
    if (active && active.id !== "auto") ordered.push(active);
    ordered.push(...rest);
    return ordered;
  })();
  return (
    <div className="flex h-6 w-full shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2 text-[11px]">
      <EditorPathBreadcrumb
        path={path}
        workspaceRoot={workspaceRoot}
        home={home}
        gitRootPath={gitRootPath}
        onRevealPath={onRevealPath}
        onSetAsRoot={onSetAsRoot}
        onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
        onRevealInTerminal={onRevealInTerminal}
        onAddToGitignore={onAddToGitignore}
      />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {onLanguageChange && (
          <Popover open={langOpen} onOpenChange={setLangOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-6 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                title="Change language mode"
              >
                {overrideLanguage
                  ? (selectableLanguages.find((l) =>
                      l.extensions[0] === overrideLanguage ||
                      l.extensions.includes(overrideLanguage)
                    )?.name ?? overrideLanguage)
                  : (currentLanguageName || "Auto")}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="end">
              <Command className="rounded-menu">
                <div className="relative px-2 py-1.5">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={13}
                    strokeWidth={2}
                    className="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <CommandPrimitive.Input
                    placeholder="Search language…"
                    className="h-7 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 pr-3 pl-6.5 text-xs outline-none transition-[color,box-shadow,background-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  />
                </div>
                <CommandList>
                  <CommandEmpty>No language found.</CommandEmpty>
                  <CommandGroup>
                    {langEntries.map((e) => (
                      <CommandItem
                        key={e.id}
                        value={e.searchValue}
                        onSelect={() => {
                          e.select();
                          setLangOpen(false);
                        }}
                        className="rounded-menu-item text-[12px]"
                      >
                        <span>
                          {e.label}
                          {e.isAuto && (
                            <span className="text-muted-foreground"> (auto)</span>
                          )}
                        </span>
                        {e.active && (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            size={13}
                            strokeWidth={2}
                            className="ml-auto shrink-0 text-primary"
                          />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        {showToggles && v && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="View options"
                className="order-last flex size-[22px] items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-[12px]">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                {extLabel} files
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={v.wrap}
                onSelect={keepOpen}
                onCheckedChange={(c) => set({ wrap: !!c })}
              >
                Word wrap
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={v.lineNumbers}
                onSelect={keepOpen}
                onCheckedChange={(c) => set({ lineNumbers: !!c })}
              >
                Line numbers
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={v.whitespace}
                onSelect={keepOpen}
                onCheckedChange={(c) => set({ whitespace: !!c })}
              >
                Show whitespace
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={v.foldGutter}
                onSelect={keepOpen}
                onCheckedChange={(c) => set({ foldGutter: !!c })}
              >
                Fold gutter
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={v.indentWithTabs}
                onSelect={keepOpen}
                onCheckedChange={(c) => set({ indentWithTabs: !!c })}
              >
                Indent with tabs
              </DropdownMenuCheckboxItem>
              <div className="flex items-center justify-between gap-2 px-2.5 py-1">
                <span className="text-[12px]">Indent size</span>
                <input
                  type="number"
                  min={EDITOR_INDENT_MIN}
                  max={EDITOR_INDENT_MAX}
                  value={v.indentSize}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (Number.isNaN(n)) return;
                    set({ indentSize: clampIndentSize(n) });
                  }}
                  className="h-6 w-14 rounded border border-border bg-transparent px-1.5 text-right text-[12px] tabular-nums outline-none focus:border-ring"
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-2.5 py-1">
                <span className="text-[12px]">Column ruler</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {v.columnRuler === 0 ? "off" : "col"}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={EDITOR_COLUMN_RULER_MAX}
                    value={v.columnRuler}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      if (Number.isNaN(n)) return;
                      set({ columnRuler: clampColumnRuler(n) });
                    }}
                    className="h-6 w-14 rounded border border-border bg-transparent px-1.5 text-right text-[12px] tabular-nums outline-none focus:border-ring"
                  />
                </div>
              </div>
              {viewToggles.onViewInSettings && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-[12px] text-muted-foreground"
                    onSelect={() => viewToggles.onViewInSettings?.()}
                  >
                    {viewToggles.ext ? `View ${viewToggles.ext} Settings` : "View file type Settings"}
                  </DropdownMenuItem>
                </>
              )}
              {globalToggles && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                    Global
                  </DropdownMenuLabel>
                  {GLOBAL_TOGGLE_LABELS.map(([key, label]) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={globalToggles.value[key]}
                      onSelect={keepOpen}
                      onCheckedChange={(c) => globalToggles.onToggle(key, !!c)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {view && onToggleSplit && (
          <button
            type="button"
            onClick={onToggleSplit}
            title={view.mode === "split" ? "Close split" : "Split view"}
            className={cn(
              "flex size-[22px] items-center justify-center rounded transition-colors",
              view.mode === "split"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={LayoutTwoColumnIcon} size={13} strokeWidth={2} />
          </button>
        )}
        {view && (
          <button
            type="button"
            onClick={view.onToggleOverlay}
            title={
              view.mode === "raw"
                ? toggleLabel ? `Preview (${toggleLabel})` : "Preview"
                : toggleLabel ? `Edit (${toggleLabel})` : "Edit"
            }
            className={cn(
              "flex size-[22px] items-center justify-center rounded transition-colors",
              view.mode === "overlay"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={view.mode === "raw" ? EyeIcon : DocumentCodeIcon}
              size={13}
              strokeWidth={2}
            />
          </button>
        )}
      </div>
    </div>
  );
}
