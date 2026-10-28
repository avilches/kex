import type { RestoreBlock } from "./restoreStart";
import { quoteShellPath } from "./quoteShellPath";

// A pending restore replaces the old error text: while a plan waits the block already carries
// the reason.
export function restoreCommandSections(pending: RestoreBlock | null) {
  return { showOldError: !pending };
}

export function pendingCdLine(block: RestoreBlock): string {
  return block.dir ? `cd ${quoteShellPath(block.dir)}` : "";
}
