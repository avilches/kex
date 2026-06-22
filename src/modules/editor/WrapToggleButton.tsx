import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setEditorWordWrap } from "@/modules/settings/store";
import { TextWrapIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function WrapToggleButton({ className }: { className?: string }) {
  const wordWrap = usePreferencesStore((s) => s.editorWordWrap);
  return (
    <button
      type="button"
      title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
      onClick={() => void setEditorWordWrap(!wordWrap)}
      className={cn(
        "flex size-[22px] items-center justify-center rounded transition-colors",
        wordWrap
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={TextWrapIcon} size={12} />
    </button>
  );
}
