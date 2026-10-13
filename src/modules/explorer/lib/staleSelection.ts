import { ancestorsToExpand, isUnder } from "@/modules/workspaces/lib/explorerRoot";

export type ParentListingStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error"
  | undefined;

const isPending = (s: ParentListingStatus) => s === "loading" || s === "idle";

// A row is only drawn once every folder from the root down is loaded, and the
// restore fetches them all at once, so any of them may still be in flight.
export function ancestorListingPending(
  root: string | null,
  selected: string,
  statusOf: (path: string) => ParentListingStatus,
): boolean {
  if (!root || selected === root || !isUnder(selected, root)) return false;
  return [root, ...ancestorsToExpand(root, selected)].some((dir) => isPending(statusOf(dir)));
}

// A selection missing from the rows is kept only while a listing it depends on
// is still being fetched (a restored selection under freshly opened folders).
// A missing or failed parent listing, or a fully loaded chain, means it is gone.
export function shouldClearSelection(
  hasRow: boolean,
  parentStatus: ParentListingStatus,
  ancestorPending: boolean,
): boolean {
  if (hasRow) return false;
  if (isPending(parentStatus)) return false;
  if (parentStatus === "loaded") return !ancestorPending;
  return true;
}
