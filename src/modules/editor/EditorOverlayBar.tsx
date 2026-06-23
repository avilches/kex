import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  clampIndentSize,
  EDITOR_INDENT_MAX,
  EDITOR_INDENT_MIN,
  type EditorViewSettings,
} from "./lib/editorViewSettings";

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
};

export function EditorOverlayBar({ view, viewToggles, globalToggles }: Props) {
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
  return (
    <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/85 p-0.5 text-[11px] shadow-sm backdrop-blur">
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
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => view.onChange("raw")}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              view.mode === "raw"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => view.onChange("rendered")}
            disabled={view.renderedDisabled}
            title={view.renderedDisabled ? view.renderedHint : undefined}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              view.mode === "rendered"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
              view.renderedDisabled &&
                "cursor-not-allowed opacity-40 hover:text-muted-foreground",
            )}
          >
            Rendered
          </button>
        </div>
      )}
    </div>
  );
}
