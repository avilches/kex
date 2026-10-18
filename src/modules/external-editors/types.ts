/** Mirrors DetectedEditor from Rust. Returned by editor_scan. */
export interface DetectedEditor {
  id: string;
  name: string;
  /** Resolved binary path or command name. */
  binary: string;
  /** Args inserted between binary and the target path at launch time. */
  argsBeforePath: string[];
  /** false means user-disabled. Absent or true means enabled. */
  enabled?: boolean;
}
