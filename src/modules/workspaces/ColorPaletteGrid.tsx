import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

// 20 swatches that fill three rows of seven together with the "No color" cell.
// Kept apart from WORKSPACE_COLOR_PALETTE, which seeds the automatic workspace colors.
export const COLOR_SWATCHES = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#b91c1c", // dark red
  "#1d4ed8", // dark blue
  "#64748b", // slate
  "#78716c", // stone
] as const;

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
// workspace and tab context menus: "No color" and the palette first, the
// free editor (preview, hex field, native picker) last.
export function ColorPaletteGrid({ value, displayColor, noneSelected, onSelect }: Props) {
  const customHex =
    value != null && !(COLOR_SWATCHES as readonly string[]).includes(value) ? value : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1">
        <button
          type="button"
          title="No color"
          onClick={() => onSelect(null)}
          className={cn(
            "flex size-5 items-center justify-center rounded-full border-2 bg-muted text-muted-foreground transition-colors",
            noneSelected
              ? "border-foreground"
              : "border-transparent hover:border-muted-foreground/50",
          )}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
        </button>
        {COLOR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            onClick={() => onSelect(hex)}
            className={cn(
              "size-5 rounded-full border-2 transition-opacity",
              value === hex ? "border-foreground" : "border-transparent hover:border-foreground/40",
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
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
      </div>
    </div>
  );
}
