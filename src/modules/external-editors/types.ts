/** Mirrors DetectedEditor from Rust. Returned by editor_scan. */
export interface DetectedEditor {
  id: string;
  name: string;
  /** Resolved binary path or command name. */
  binary: string;
  /** Args inserted between binary and the target path at launch time. */
  argsBeforePath: string[];
}

/** User-defined editor entry stored in Settings preferences. */
export interface CustomEditor {
  /** Client-generated stable ID (use crypto.randomUUID()). */
  id: string;
  name: string;
  binary: string;
  argsBeforePath: string[];
  /** Whether to open the active file, workspace root, or current folder. Defaults to "file". */
  targetKind?: "file" | "workspace" | "terminal";
}

export type AnyEditor = DetectedEditor | CustomEditor;
