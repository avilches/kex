import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { defaultMonoFontFamily } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  CODE_DEFAULTS,
  clampIndentSize,
  EDITOR_INDENT_MAX,
  EDITOR_INDENT_MIN,
  type EditorViewMap,
  type EditorViewSettings,
} from "@/modules/editor/lib/editorViewSettings";
import {
  type CursorStyle,
  CURSOR_STYLES,
  EDITOR_BLINK_RATE_DEFAULT,
  EDITOR_BLINK_RATE_MAX,
  EDITOR_BLINK_RATE_MIN,
  EDITOR_BLINK_RATE_STEP,
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  EDITOR_LINE_HEIGHT_DEFAULT,
  FONT_SIZE_STEP,
  LETTER_SPACING_DEFAULT,
  LETTER_SPACING_MAX,
  LETTER_SPACING_MIN,
  LETTER_SPACING_STEP,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  addEditorViewEntries,
  deleteEditorViewEntry,
  patchEditorViewEntry,
  resetEditorViewEntry,
  setEditorAutoSave,
  setEditorAutocompletion,
  setEditorBracketMatching,
  setEditorCloseBrackets,
  setEditorCursorBlink,
  setEditorCursorBlinkRate,
  setEditorCursorStyle,
  setEditorFontFamily,
  setEditorFontSize,
  setEditorLetterSpacing,
  setEditorLineHeight,
  setEditorScrollPastEnd,
} from "@/modules/settings/store";
import { CursorGlyph } from "../components/CursorGlyph";
import { FieldLabel } from "../components/FieldLabel";
import { FontFamilyInput } from "../components/FontFamilyInput";
import {
  formatPx,
  formatRatio,
  formatSignedPx,
} from "../components/formatters";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { SliderRow } from "../components/SliderRow";

export function EditorSection() {
  const editorFontFamily = usePreferencesStore((s) => s.editorFontFamily);
  const editorFontSize = usePreferencesStore((s) => s.editorFontSize);
  const editorLetterSpacing = usePreferencesStore((s) => s.editorLetterSpacing);
  const editorLineHeight = usePreferencesStore((s) => s.editorLineHeight);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const editorScrollPastEnd = usePreferencesStore((s) => s.editorScrollPastEnd);
  const editorBracketMatching = usePreferencesStore(
    (s) => s.editorBracketMatching,
  );
  const editorCloseBrackets = usePreferencesStore((s) => s.editorCloseBrackets);
  const editorAutocompletion = usePreferencesStore(
    (s) => s.editorAutocompletion,
  );
  const editorCursorBlink = usePreferencesStore((s) => s.editorCursorBlink);
  const editorCursorBlinkRate = usePreferencesStore(
    (s) => s.editorCursorBlinkRate,
  );
  const editorCursorStyle = usePreferencesStore((s) => s.editorCursorStyle);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Editor" />

      <div className="flex flex-col gap-2">
        <FieldLabel>Font</FieldLabel>
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

      <div className="flex flex-col gap-2">
        <FieldLabel>Behavior</FieldLabel>
        <SettingRow
          title="Auto save"
          description="Save files when editor loses focus, tab or app closes and every X seconds."
        >
          <Switch
            checked={editorAutoSave}
            onCheckedChange={(v) => void setEditorAutoSave(v)}
          />
        </SettingRow>
        <SettingRow
          title="Scroll past end"
          description="Allow scrolling beyond the last line."
        >
          <Switch
            checked={editorScrollPastEnd}
            onCheckedChange={(v) => void setEditorScrollPastEnd(v)}
          />
        </SettingRow>
        <SettingRow
          title="Bracket matching"
          description="Highlight the bracket matching the one at the cursor."
        >
          <Switch
            checked={editorBracketMatching}
            onCheckedChange={(v) => void setEditorBracketMatching(v)}
          />
        </SettingRow>
        <SettingRow
          title="Auto close brackets"
          description="Insert the closing bracket/quote automatically."
        >
          <Switch
            checked={editorCloseBrackets}
            onCheckedChange={(v) => void setEditorCloseBrackets(v)}
          />
        </SettingRow>
        <SettingRow
          title="Autocompletion"
          description="Show completion suggestions while typing."
        >
          <Switch
            checked={editorAutocompletion}
            onCheckedChange={(v) => void setEditorAutocompletion(v)}
          />
        </SettingRow>
      </div>

      <FileTypesSection />

      <div className="flex flex-col gap-2">
        <FieldLabel>Cursor</FieldLabel>
        <SettingRow title="Cursor style" description="Editor caret shape.">
          <Select
            value={editorCursorStyle}
            onValueChange={(v) => void setEditorCursorStyle(v as CursorStyle)}
          >
            <SelectTrigger size="sm" className="h-8 w-28 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURSOR_STYLES.map((style) => (
                <SelectItem
                  key={style}
                  value={style}
                  className="text-[12px] [&>span:last-child]:w-full"
                >
                  <span className="capitalize">{style}</span>
                  <CursorGlyph kind={style} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow title="Cursor blinking" description="Blink the editor cursor.">
          <div className="flex items-center gap-3">
            <DemoCursor
              style={editorCursorStyle}
              blink={editorCursorBlink}
              rate={editorCursorBlinkRate}
            />
            {editorCursorBlink && (
              <div className="flex items-center gap-2">
                <Slider
                  value={[editorCursorBlinkRate]}
                  min={EDITOR_BLINK_RATE_MIN}
                  max={EDITOR_BLINK_RATE_MAX}
                  step={EDITOR_BLINK_RATE_STEP}
                  onValueChange={(v) =>
                    void setEditorCursorBlinkRate(
                      v[0] ?? EDITOR_BLINK_RATE_DEFAULT,
                    )
                  }
                  className="w-28"
                />
                <span className="w-12 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">
                  {editorCursorBlinkRate} ms
                </span>
                <button
                  type="button"
                  title="Reset to default"
                  disabled={editorCursorBlinkRate === EDITOR_BLINK_RATE_DEFAULT}
                  onClick={() =>
                    void setEditorCursorBlinkRate(EDITOR_BLINK_RATE_DEFAULT)
                  }
                  className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <HugeiconsIcon icon={Refresh01Icon} size={11} />
                </button>
              </div>
            )}
            <Switch
              checked={editorCursorBlink}
              onCheckedChange={(v) => void setEditorCursorBlink(v)}
            />
          </div>
        </SettingRow>
      </div>
    </div>
  );
}

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

function effectiveSettings(
  entryKey: string,
  partial: Partial<EditorViewSettings>,
  map: EditorViewMap,
): EditorViewSettings {
  const starBase: EditorViewSettings = { ...CODE_DEFAULTS, ...(map["*"] ?? {}) };
  if (entryKey === "*") return starBase;
  return { ...starBase, ...partial };
}

function extLabel(key: string): string {
  if (key === "*") return "Rest of the files";
  return `.${key}`;
}

function settingsSummary(s: EditorViewSettings): string {
  const parts: string[] = [
    `Wrap ${s.wrap ? "on" : "off"}`,
    `Line# ${s.lineNumbers ? "on" : "off"}`,
    `WS ${s.whitespace ? "on" : "off"}`,
    `Fold ${s.foldGutter ? "on" : "off"}`,
    `Tabs ${s.indentWithTabs ? "on" : "off"}`,
    `Indent ${s.indentSize}`,
  ];
  return parts.join(" · ");
}

function FileTypesSection() {
  const editorViewByExt = usePreferencesStore((s) => s.editorViewByExt);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="flex flex-col gap-2">
      <FieldLabel>File types</FieldLabel>
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
            map={editorViewByExt}
          />
        ))}
      </div>
    </div>
  );
}

type ExtensionRowProps = {
  entryKey: string;
  partial: Partial<EditorViewSettings>;
  expanded: boolean;
  onToggle: () => void;
  map: EditorViewMap;
};

function ExtensionRow({
  entryKey,
  partial,
  expanded,
  onToggle,
  map,
}: ExtensionRowProps) {
  const effective = effectiveSettings(entryKey, partial, map);
  const isCatchAll = entryKey === "*";

  return (
    <div className="rounded-lg border border-border/60 bg-card/60">
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

function DemoCursor({
  style,
  blink,
  rate,
}: {
  style: CursorStyle;
  blink: boolean;
  rate: number;
}) {
  const caretRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = caretRef.current;
    if (!el) return;
    if (!blink) {
      el.style.opacity = "1";
      return;
    }
    const anim = el.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.49 },
        { opacity: 0, offset: 0.5 },
        { opacity: 0, offset: 1 },
      ],
      { duration: rate, iterations: Number.POSITIVE_INFINITY },
    );
    return () => anim.cancel();
  }, [blink, rate]);

  const shape: Record<CursorStyle, string> = {
    bar: "border-l-2 border-current",
    block: "bg-current",
    underline: "border-b-2 border-current",
  };
  return (
    <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded border border-border/60 bg-background">
      <span
        ref={caretRef}
        className={cn("inline-block h-4 w-1.5 text-foreground", shape[style])}
      />
    </span>
  );
}
