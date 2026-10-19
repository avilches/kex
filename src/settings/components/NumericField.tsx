import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { INPUT_CLASS } from "./inputClass";

export function NumericField({
  value,
  min,
  max,
  clamp,
  onCommit,
  onKeyDown,
  className,
}: {
  value: number;
  min: number;
  max: number;
  clamp?: (n: number) => number;
  onCommit: (n: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    const n = Number.parseInt(draft.trim(), 10);
    if (Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const next = clamp ? clamp(n) : n;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onFocus={(e) => {
        focusedRef.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onChange={(e) => setDraft(e.target.value)}
      className={cn(
        INPUT_CLASS,
        "h-7 w-14 px-1.5 text-right text-[12px] tabular-nums",
        className,
      )}
    />
  );
}
