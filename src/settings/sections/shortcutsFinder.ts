// What to say when the key finder shows no row. The matches can all be shortcuts the list never
// draws (the index families are edited by their modifiers elsewhere), and those keys are in use.
export function finderEmptyMessage(matches: number, visibleRows: number): string | null {
  if (visibleRows > 0) return null;
  return matches === 0
    ? "No shortcut uses these keys."
    : "These keys are used by a built-in shortcut that this list does not show.";
}
