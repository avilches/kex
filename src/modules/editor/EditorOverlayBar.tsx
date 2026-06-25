import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DocumentCodeIcon, EyeIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  clampIndentSize,
  EDITOR_INDENT_MAX,
  EDITOR_INDENT_MIN,
  type EditorViewSettings,
} from "./lib/editorViewSettings";
import { LANGUAGES } from "./lib/languageDefinitions";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useState } from "react";

type MarkdownViewMode = "rendered" | "raw";

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
  view?: {
    mode: MarkdownViewMode;
    onChange: (mode: MarkdownViewMode) => void;
    renderedDisabled?: boolean;
    renderedHint?: string;
    isHtml?: boolean;
  };
  viewToggles?: {
    ext: string;
    value: EditorViewSettings;
    onChange: (next: EditorViewSettings) => void;
  };
  globalToggles?: {
    value: EditorGlobalToggles;
    onToggle: (key: EditorGlobalToggleKey, value: boolean) => void;
  };
  overrideLanguage?: string | null;
  currentLanguageName?: string;
  onLanguageChange?: (lang: string | null) => void;
};

export function EditorOverlayBar({ view, viewToggles, globalToggles, overrideLanguage, currentLanguageName, onLanguageChange }: Props) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const shortcutId = view?.isHtml ? "editor.html.toggleView" : "editor.markdown.toggleView";
  const toggleLabel = view ? getShortcutLabel(shortcutId, userShortcuts) : null;
  const showToggles = view?.mode !== "rendered" && !!viewToggles;
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
  return (
    <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/85 p-0.5 text-[11px] shadow-sm backdrop-blur">
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
            <Command>
              <CommandInput placeholder="Search language..." className="h-8 text-[12px]" />
              <CommandList>
                <CommandEmpty>No language found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="auto"
                    onSelect={() => {
                      onLanguageChange(null);
                      setLangOpen(false);
                    }}
                    className="text-[12px]"
                  >
                    Auto
                  </CommandItem>
                  {selectableLanguages.map((lang) => (
                    <CommandItem
                      key={lang.extensions[0]}
                      value={lang.name}
                      onSelect={() => {
                        onLanguageChange(lang.extensions[0]);
                        setLangOpen(false);
                      }}
                      className="text-[12px]"
                    >
                      {lang.name}
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
              className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
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
      {view && showToggles && v && <div className="h-4 w-px bg-border/60" />}
      {view && (
        <button
          type="button"
          onClick={() => view.onChange(view.mode === "raw" ? "rendered" : "raw")}
          disabled={view.renderedDisabled && view.mode === "raw"}
          title={
            view.renderedDisabled && view.mode === "raw"
              ? view.renderedHint
              : view.mode === "raw"
                ? toggleLabel ? `Preview (${toggleLabel})` : "Preview"
                : toggleLabel ? `Edit (${toggleLabel})` : "Edit"
          }
          className={cn(
            "flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground",
            view.renderedDisabled &&
              view.mode === "raw" &&
              "cursor-not-allowed opacity-40 hover:text-muted-foreground",
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
  );
}
