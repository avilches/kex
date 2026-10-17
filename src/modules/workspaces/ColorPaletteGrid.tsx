import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { WORKSPACE_COLOR_PALETTE } from "@/modules/workspaces/lib/workspaceColor";

type Props = {
  // Explicit color of the entity, if any; drives the swatch highlight and the hex field.
  value: string | null | undefined;
  // Color actually painted (may differ from `value` for an automatic workspace color).
  displayColor: string | null;
  // True when "No color" is the current choice.
  noneSelected: boolean;
  onSelect: (color: string | null) => void;
};

// The color picker shared by the workspace properties dialog and the
// workspace and tab context menus: preview, hex field, native picker, "No
// color" and the palette.
export function ColorPaletteGrid({ value, displayColor, noneSelected, onSelect }: Props) {
  const customHex =
    value != null && !(WORKSPACE_COLOR_PALETTE as readonly string[]).includes(value) ? value : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div
        className="size-5 shrink-0 rounded-full border border-border"
        style={displayColor ? { backgroundColor: displayColor } : undefined}
      />
      <input
        className="h-6 w-20 rounded border border-border bg-background px-1.5 font-mono text-[11px] outline-none ring-ring focus-visible:ring-1"
        placeholder="#rrggbb"
        defaultValue={customHex}
        key={customHex}
        spellCheck={false}
        autoComplete="off"
        // Radix menus run typeahead and arrow navigation on keydown.
        onKeyDown={(e) => {
          if (e.key !== "Escape") e.stopPropagation();
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onSelect(v);
        }}
      />
      <label
        title="Pick color"
        className="relative flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
        style={displayColor ? { backgroundColor: `${displayColor}33` } : undefined}
      >
        <input
          type="color"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={displayColor ?? "#4f8ef7"}
          onChange={(e) => onSelect(e.target.value)}
        />
        <span className="pointer-events-none text-[10px] font-bold leading-none">H</span>
      </label>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <button
        type="button"
        title="No color"
        onClick={() => onSelect(null)}
        className={cn(
          "flex size-6 items-center justify-center rounded-full border-2 bg-muted text-muted-foreground transition-colors",
          noneSelected
            ? "border-foreground"
            : "border-transparent hover:border-muted-foreground/50",
        )}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
      </button>
      {WORKSPACE_COLOR_PALETTE.map((hex) => (
        <button
          key={hex}
          type="button"
          title={hex}
          onClick={() => onSelect(hex)}
          className={cn(
            "size-6 rounded-full border-2 transition-opacity",
            value === hex ? "border-foreground" : "border-transparent hover:border-foreground/40",
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}
