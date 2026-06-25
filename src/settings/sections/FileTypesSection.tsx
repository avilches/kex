import { Switch } from "@/components/ui/switch";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  CODE_DEFAULTS,
  clampColumnRuler,
  clampIndentSize,
  EDITOR_COLUMN_RULER_MAX,
  EDITOR_INDENT_MAX,
  EDITOR_INDENT_MIN,
  type EditorViewMap,
  type EditorViewSettings,
} from "@/modules/editor/lib/editorViewSettings";
import {
  addEditorViewEntries,
  deleteEditorViewEntry,
  patchEditorViewEntry,
  resetEditorViewEntry,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";

const EXT_VALID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

function isValidExt(e: string): boolean {
  return EXT_VALID_RE.test(e);
}

function sortedEntries(map: EditorViewMap): [string, Partial<EditorViewSettings>][] {
  return Object.entries(map).sort(([a], [b]) => {
    if (a === "*") return 1;
    if (b === "*") return -1;
    return a.localeCompare(b);
  });
}

function effectiveSettings(partial: Partial<EditorViewSettings>): EditorViewSettings {
  return { ...CODE_DEFAULTS, ...partial };
}

function extLabel(key: string): string {
  if (key === "*") return "Rest of the files";
  return `.${key}`;
}

function settingsSummary(s: EditorViewSettings): string {
  const parts: string[] = [];
  if (s.wrap) parts.push("Word wrap");
  if (s.lineNumbers) parts.push("Line#");
  if (s.whitespace) parts.push("Whitespace");
  if (s.foldGutter) parts.push("Fold");
  if (s.indentWithTabs) parts.push("Tabs");
  parts.push(`Indent ${s.indentSize}`);
  if (s.columnRuler > 0) parts.push(`Col ${s.columnRuler}`);
  if (s.spellCheck) parts.push("Spell check");
  return parts.join(" · ");
}

export function FileTypesSection({
  focusExt,
  onFocusConsumed,
}: {
  focusExt?: string;
  onFocusConsumed?: () => void;
} = {}) {
  const editorViewByExt = usePreferencesStore((s) => s.editorViewByExt);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const focusHandledRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!focusExt) return;
    if (focusHandledRef.current === focusExt) return;
    // Wait until preferences finish loading before deciding if the entry exists.
    if (Object.keys(editorViewByExt).length === 0) return;
    focusHandledRef.current = focusExt;
    if (editorViewByExt[focusExt] !== undefined) {
      setExpandedKey(focusExt);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          sectionRef.current
            ?.querySelector(`[data-ext="${CSS.escape(focusExt)}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }),
      );
    } else {
      setFilterText(focusExt);
    }
    onFocusConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusExt, editorViewByExt]);

  const allEntries = sortedEntries(editorViewByExt);
  const filter = filterText.trim().toLowerCase();
  const filteredEntries = filter === ""
    ? allEntries
    : allEntries.filter(([key]) => key === "*" || key.startsWith(filter));

  function handleCommit() {
    const raw = filterText.trim().toLowerCase();
    if (!raw) return;

    const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) return;

    const invalid = tokens.filter((t) => !isValidExt(t));
    if (invalid.length > 0) {
      setAddError(`Invalid: ${invalid.map((t) => `"${t}"`).join(", ")}. Use letters, digits, - or .`);
      return;
    }

    setAddError(null);

    // If a single token matches an existing entry exactly, just expand it.
    if (tokens.length === 1 && editorViewByExt[tokens[0]] !== undefined) {
      setExpandedKey(tokens[0]);
      setFilterText("");
      return;
    }

    const newExts = tokens.filter((t) => editorViewByExt[t] === undefined);
    if (newExts.length > 0) {
      void addEditorViewEntries(newExts);
      setExpandedKey(newExts[0] ?? null);
    }
    setFilterText("");
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="File Types" />
      <div ref={sectionRef} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCommit();
            }}
            placeholder="Filter or add: ts, tsx, go ..."
            className="h-8 flex-1 rounded-md border border-border bg-transparent px-2.5 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-ring"
          />
          {filterText.trim() && (
            <button
              type="button"
              title="Add file type"
              onClick={handleCommit}
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Add01Icon} size={13} />
            </button>
          )}
        </div>
        {addError && (
          <span className="text-[11px] text-destructive">{addError}</span>
        )}
        <div className="flex flex-col gap-1">
          {filteredEntries.map(([key, partial]) => (
            <ExtensionRow
              key={key}
              entryKey={key}
              partial={partial}
              expanded={expandedKey === key}
              onToggle={() =>
                setExpandedKey((prev) => (prev === key ? null : key))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type ExtensionRowProps = {
  entryKey: string;
  partial: Partial<EditorViewSettings>;
  expanded: boolean;
  onToggle: () => void;
};

function ExtensionRow({ entryKey, partial, expanded, onToggle }: ExtensionRowProps) {
  const effective = effectiveSettings(partial);
  const isCatchAll = entryKey === "*";

  return (
    <div data-ext={entryKey} className="rounded-lg border border-border/60 bg-card/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex size-[18px] shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon
            icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
            size={11}
          />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
        >
          <span className="shrink-0 text-[12.5px] font-medium font-mono">
            {extLabel(entryKey)}
          </span>
          {!expanded && (
            <span className="truncate text-[11px] text-muted-foreground">
              {settingsSummary(effective)}
            </span>
          )}
        </button>
        {isCatchAll && (
          <button
            type="button"
            title="Reset to defaults"
            onClick={() => void resetEditorViewEntry()}
            className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={11} />
          </button>
        )}
        {!isCatchAll && (
          <button
            type="button"
            title="Remove"
            onClick={() => void deleteEditorViewEntry(entryKey)}
            className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={11} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-border/40 px-4 py-3">
          <ExtToggle
            label="Word wrap"
            checked={effective.wrap}
            onChange={(v) => void patchEditorViewEntry(entryKey, { wrap: v })}
          />
          <ExtToggle
            label="Line numbers"
            checked={effective.lineNumbers}
            onChange={(v) =>
              void patchEditorViewEntry(entryKey, { lineNumbers: v })
            }
          />
          <ExtToggle
            label="Show whitespace"
            checked={effective.whitespace}
            onChange={(v) =>
              void patchEditorViewEntry(entryKey, { whitespace: v })
            }
          />
          <ExtToggle
            label="Fold gutter"
            checked={effective.foldGutter}
            onChange={(v) =>
              void patchEditorViewEntry(entryKey, { foldGutter: v })
            }
          />
          <div className="flex items-center justify-between gap-4">
            <ExtToggle
              label="Indent with tabs"
              checked={effective.indentWithTabs}
              onChange={(v) =>
                void patchEditorViewEntry(entryKey, { indentWithTabs: v })
              }
            />
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[12px] text-muted-foreground">
                Indent size
              </span>
              <input
                type="number"
                min={EDITOR_INDENT_MIN}
                max={EDITOR_INDENT_MAX}
                value={effective.indentSize}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isNaN(n)) return;
                  void patchEditorViewEntry(entryKey, {
                    indentSize: clampIndentSize(n),
                  });
                }}
                className="h-7 w-14 rounded border border-border bg-transparent px-1.5 text-right text-[12px] tabular-nums outline-none focus:border-ring"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12px]">Column ruler</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[12px] text-muted-foreground">
                {effective.columnRuler === 0 ? "off" : "col"}
              </span>
              <input
                type="number"
                min={0}
                max={EDITOR_COLUMN_RULER_MAX}
                value={effective.columnRuler}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isNaN(n)) return;
                  void patchEditorViewEntry(entryKey, {
                    columnRuler: clampColumnRuler(n),
                  });
                }}
                className="h-7 w-14 rounded border border-border bg-transparent px-1.5 text-right text-[12px] tabular-nums outline-none focus:border-ring"
              />
            </div>
          </div>
          <ExtToggle
            label="Spell check"
            checked={effective.spellCheck}
            onChange={(v) =>
              void patchEditorViewEntry(entryKey, { spellCheck: v })
            }
          />
        </div>
      )}
    </div>
  );
}

function ExtToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
