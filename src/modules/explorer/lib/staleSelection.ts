export type ParentListingStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error"
  | undefined;

// A selection missing from the rows is kept only while its parent listing is
// still being fetched (a restored selection under freshly opened folders).
// A missing, loaded or failed listing means the path is really gone.
export function shouldClearSelection(
  hasRow: boolean,
  parentStatus: ParentListingStatus,
): boolean {
  if (hasRow) return false;
  return parentStatus !== "loading" && parentStatus !== "idle";
}
