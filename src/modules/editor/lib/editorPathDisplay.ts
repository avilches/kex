import { pathBasename, pathDirname, segmentsFromCwd } from "@/lib/pathUtils";

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

export type EditorPathDisplay = {
  /** Directory segment labels shown before the filename, in order. */
  dirs: string[];
  /** The filename leaf. */
  name: string;
};

/**
 * Segments for the editor top bar. Relative to `explorerRoot` when the file
 * lives inside it; otherwise an absolute breadcrumb with `~` for home.
 */
export function editorPathDisplay(
  path: string,
  explorerRoot: string | null,
  home: string | null,
): EditorPathDisplay {
  const name = pathBasename(path);
  const normPath = norm(path);

  if (explorerRoot) {
    const root = norm(explorerRoot).replace(/\/+$/, "");
    if (root !== "" && normPath.toLowerCase().startsWith(root.toLowerCase() + "/")) {
      const rel = normPath.slice(root.length + 1);
      const parts = rel.split("/").filter(Boolean);
      return { dirs: parts.slice(0, -1), name };
    }
  }

  const segments = segmentsFromCwd(pathDirname(normPath), home);
  return { dirs: segments.map((s) => s.label), name };
}
