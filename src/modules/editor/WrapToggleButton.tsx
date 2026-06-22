import { cn } from "@/lib/utils";
import { TextWrapIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  value: boolean;
  onToggle: () => void;
};

export function WrapToggleButton({ value, onToggle }: Props) {
  return (
    <button
      type="button"
      title={value ? "Disable word wrap" : "Enable word wrap"}
      onClick={onToggle}
      className={cn(
        "flex size-[22px] items-center justify-center rounded transition-colors",
        value
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={TextWrapIcon} size={12} />
    </button>
  );
}
