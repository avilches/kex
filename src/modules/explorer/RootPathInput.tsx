import { useLayoutEffect, useRef } from "react";

type Props = {
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export function RootPathInput({ initial, onSubmit, onCancel }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  const finish = (value: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (value === null) onCancel();
    else onSubmit(value);
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Explorer root path"
      className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-primary"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={() => finish(null)}
    />
  );
}
