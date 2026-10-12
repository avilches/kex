import type { RestoreBlock } from "./restoreStart";
import { quoteShellPath } from "./quoteShellPath";

// A pending restore replaces the Enabled switch and the old error text: while a plan waits,
// "enabled" has no meaning and the block already carries the reason.
export function runOnStartSections(pending: RestoreBlock | null) {
  return { showEnabled: !pending, showOldError: !pending };
}

export function pendingCdLine(block: RestoreBlock): string {
  return block.dir ? `cd ${quoteShellPath(block.dir)}` : "";
}
