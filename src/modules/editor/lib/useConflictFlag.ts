import { useCallback, useState } from "react";

// Shared between useDocument.ts and useMarkdownDocument.ts: both block the
// pane on a conflict overlay while dirty, letting the user either keep their
// local edits (dismiss) or discard them for the disk version. The "discard"
// side (reloadFromDisk) differs per hook (string buffer vs frontmatter-aware
// MarkdownDocumentBuffer), so only the flag and its "keep" resolution are
// shared here.
export function useConflictFlag() {
  const [conflict, setConflict] = useState(false);
  const keepLocalChanges = useCallback(() => setConflict(false), []);
  return { conflict, setConflict, keepLocalChanges };
}
