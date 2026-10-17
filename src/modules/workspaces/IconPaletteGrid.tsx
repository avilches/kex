import { useState } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { WORKSPACE_ICON_PALETTE } from "@/modules/workspaces/lib/workspaceIcon";
import { useIconSearch } from "@/modules/workspaces/lib/useIconCatalog";
import { INPUT_CLASS } from "@/settings/components/inputClass";

type Props = {
  value: string | undefined;
  onSelect: (icon: string | null) => void;
};

const SEARCH_LIMIT = 120;

function IconButton({
  name,
  label,
  icon,
  selected,
  onSelect,
}: {
  name: string;
  label: string;
  icon: IconSvgElement;
  selected: boolean;
  onSelect: (icon: string) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={() => onSelect(name)}
      className={cn(
        "flex size-8 items-center justify-center rounded border-2 text-foreground transition-colors",
        selected
          ? "border-foreground bg-muted"
          : "border-transparent hover:border-muted-foreground/40 hover:bg-muted/60",
      )}
    >
      <HugeiconsIcon icon={icon} size={17} strokeWidth={1.5} />
    </button>
  );
}

// The icon picker shared by the workspace and tab context menus: the curated
// palette by default, any Hugeicons icon through the search box.
export function IconPaletteGrid({ value, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const { results, loading } = useIconSearch(query, SEARCH_LIMIT);
  const searching = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        // Radix menus run typeahead and arrow navigation on keydown.
        onKeyDown={(e) => {
          if (e.key !== "Escape") e.stopPropagation();
        }}
        placeholder="Search any icon..."
        spellCheck={false}
        autoComplete="off"
        className={cn(INPUT_CLASS, "h-7 w-full text-[12px]")}
      />
      <div className="flex flex-wrap gap-0.5">
        <button
          type="button"
          title="No icon"
          onClick={() => onSelect(null)}
          className={cn(
            "flex size-8 items-center justify-center rounded border-2 bg-muted text-muted-foreground transition-colors",
            value == null
              ? "border-foreground"
              : "border-transparent hover:border-muted-foreground/50",
          )}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
        </button>
        {searching
          ? results.map((entry) => (
              <IconButton
                key={entry.name}
                name={entry.name}
                label={entry.label}
                icon={entry.icon}
                selected={value === entry.name}
                onSelect={onSelect}
              />
            ))
          : WORKSPACE_ICON_PALETTE.map((entry) => (
              <IconButton
                key={entry.name}
                name={entry.name}
                label={entry.label}
                icon={entry.icon as IconSvgElement}
                selected={value === entry.name}
                onSelect={onSelect}
              />
            ))}
      </div>
      {searching && loading && (
        <span className="text-[11px] text-muted-foreground">Loading icons...</span>
      )}
      {searching && !loading && results.length === 0 && (
        <span className="text-[11px] text-muted-foreground">No icons found</span>
      )}
    </div>
  );
}
