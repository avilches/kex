import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { defaultMonoFontFamily } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
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
