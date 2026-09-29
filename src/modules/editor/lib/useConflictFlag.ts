import { useCallback, useState } from "react";

// Blocks the pane on a conflict overlay while dirty, letting the user either
// keep their local edits (dismiss) or discard them for the disk version. Only
// the flag and its "keep" resolution live here; reloadFromDisk stays in the
// document hook.
export function useConflictFlag() {
  const [conflict, setConflict] = useState(false);
  const keepLocalChanges = useCallback(() => setConflict(false), []);
  return { conflict, setConflict, keepLocalChanges };
}
