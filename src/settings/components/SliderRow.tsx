import { Slider } from "@/components/ui/slider";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SettingRow } from "./SettingRow";

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
}: {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <SettingRow title={title} description={description}>
      <div className="flex items-center gap-2">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0] ?? defaultValue)}
          className="w-32"
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">
          {format(value)}
        </span>
        <button
          type="button"
          title="Reset to default"
          disabled={value === defaultValue}
          onClick={() => onChange(defaultValue)}
          className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={11} />
        </button>
      </div>
    </SettingRow>
  );
}
