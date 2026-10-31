import { Slider } from "@/components/ui/slider";
import type { PrefKey } from "@/modules/settings/store";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { SettingRow } from "./SettingRow";
import { useApplyingPref } from "./useApplyingPref";

export function SliderRow({
  title,
  description,
  value,
  min,
  max,
  step,
  defaultValue,
  format,
  onChange,
  appliesTo,
}: {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (v: number) => string;
  /** Called once when the user releases the slider, never on each step of a drag. */
  onChange: (v: number) => void;
  /** Preference the main window applies slowly; shows "Applying..." until it confirms. */
  appliesTo?: PrefKey;
}) {
  const [draft, setDraft] = useState<{ v: number; base: number } | null>(null);
  const { applying, start } = useApplyingPref(appliesTo);

  const commit = (next: number) => {
    if (next === value) {
      setDraft(null);
      return;
    }
    start();
    onChange(next);
  };

  const shown = draft && draft.base === value ? draft.v : value;

  return (
    <SettingRow title={title} description={description}>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Slider
            value={[shown]}
            min={min}
            max={max}
            step={step}
            onValueChange={(v) =>
              setDraft({ v: v[0] ?? defaultValue, base: value })
            }
            onValueCommit={(v) => commit(v[0] ?? defaultValue)}
            className="w-32"
          />
          <span className="w-12 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">
            {format(shown)}
          </span>
          <button
            type="button"
            title="Reset to default"
            disabled={shown === defaultValue}
            onClick={() => {
              setDraft({ v: defaultValue, base: value });
              commit(defaultValue);
            }}
            className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={11} />
          </button>
        </div>
        {appliesTo && (
          <span
            aria-live="polite"
            className={`text-[11px] text-muted-foreground ${applying ? "" : "invisible"}`}
          >
            Applying...
          </span>
        )}
      </div>
    </SettingRow>
  );
}
