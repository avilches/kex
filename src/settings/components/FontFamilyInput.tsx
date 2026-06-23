import { Input } from "@/components/ui/input";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { SettingRow } from "./SettingRow";

export function FontFamilyInput({
  value,
  defaultFamily,
  onChange,
}: {
  value: string;
  defaultFamily: string;
  onChange: (v: string) => void;
}) {
  // An empty stored preference means "platform default": show that default
  // verbatim so the user always sees what is actually rendering, and restore it
  // if they clear the field.
  const [draft, setDraft] = useState(value || defaultFamily);

  useEffect(() => {
    setDraft(value || defaultFamily);
  }, [value, defaultFamily]);

  const commit = () => {
    const next = draft.trim();
    if (next === "" || next === defaultFamily) {
      setDraft(defaultFamily);
      if (value !== "") onChange("");
      return;
    }
    setDraft(next);
    if (next !== value) onChange(next);
  };

  const isDefault = value === "";

  return (
    <SettingRow
      title="Font family"
      description="Comma-separated list with per-glyph fallback. Clear it to restore the platform default."
    >
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={draft}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="h-8 w-56 rounded-md border border-border bg-background px-2.5 text-[12px] md:text-[12px] outline-none focus:border-foreground/40 focus-visible:ring-0 focus-visible:border-foreground/40"
        />
        <button
          type="button"
          title="Reset to default"
          disabled={isDefault}
          onClick={() => {
            setDraft(defaultFamily);
            onChange("");
          }}
          className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={11} />
        </button>
      </div>
    </SettingRow>
  );
}
