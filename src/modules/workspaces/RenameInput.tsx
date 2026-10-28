import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, type RefObject, useState } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"input">, "ref"> & {
  inputRef: RefObject<HTMLInputElement | null>;
  // Called after the X emptied the field, so the live title draft follows.
  onCleared: () => void;
};

// Uncontrolled text field of the rename popovers with an X at the end that
// appears while there is something typed and empties it.
export function RenameInput({ inputRef, onCleared, onChange, defaultValue, className, ...rest }: Props) {
  const [hasText, setHasText] = useState(String(defaultValue ?? "") !== "");
  return (
    <div className="relative">
      <input
        {...rest}
        ref={inputRef}
        defaultValue={defaultValue}
        onChange={(e) => {
          setHasText(e.target.value !== "");
          onChange?.(e);
        }}
        className={cn(className, hasText && "pr-6")}
      />
      {hasText && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Clear name"
          title="Clear name"
          // Keeps the focus in the field so the popover does not read it as leaving.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const input = inputRef.current;
            if (!input) return;
            input.value = "";
            setHasText(false);
            input.focus();
            onCleared();
          }}
          className="absolute right-1 top-1/2 flex size-[18px] -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
