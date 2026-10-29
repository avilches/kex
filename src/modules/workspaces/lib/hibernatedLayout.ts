export type HibernatedLayout = "full" | "compact" | "bare";

// How much of the placeholder fits in the pane: everything, then without the
// folder and command table, then just the Restore button.
const BARE_BELOW = { width: 360, height: 300 };
const COMPACT_BELOW = { width: 440, height: 430 };

export function hibernatedLayout(width: number, height: number): HibernatedLayout {
  if (width < BARE_BELOW.width || height < BARE_BELOW.height) return "bare";
  if (width < COMPACT_BELOW.width || height < COMPACT_BELOW.height) return "compact";
  return "full";
}
