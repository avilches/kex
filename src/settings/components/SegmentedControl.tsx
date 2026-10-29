import { cn } from "@/lib/utils";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { CSSProperties } from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  style?: CSSProperties;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-md bg-muted/60 p-0.5"
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          style={o.style}
          className={cn(
            "truncate rounded px-2 py-1.5 text-[12px] text-muted-foreground outline-none transition-colors",
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-sm data-[state=checked]:ring-1 data-[state=checked]:ring-border",
          )}
        >
          {o.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
