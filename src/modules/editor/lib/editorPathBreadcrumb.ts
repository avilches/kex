import { pathBasename, pathDirname, segmentsFromCwd } from "@/lib/pathUtils";
import { isUnder } from "@/modules/workspaces/lib/explorerRoot";

export type EditorSegmentRelation = "above-root" | "root" | "inside-root";

export type EditorPathSegment = {
  label: string;
  fullPath: string;
  isHome: boolean;
  relation: EditorSegmentRelation;
};

export type EditorPathBreadcrumb = {
  segments: EditorPathSegment[];
  fileName: string;
};

function canon(p: string): string {
  const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return n === "" ? "/" : n;
}

/**
 * Breadcrumb model for the editor top bar: the file's directory split into
 * clickable segments plus the non-clickable filename leaf. Each directory
 * segment is tagged relative to the workspace root so the UI can mark the root
 * and dim its ancestors. Marking is suppressed when there is no root or the
 * file lives outside it, leaving every segment neutral.
 */
export function buildEditorPathBreadcrumb(
  filePath: string,
  workspaceRoot: string | null,
  home: string | null,
): EditorPathBreadcrumb {
  const fileName = pathBasename(filePath);
  const dir = pathDirname(filePath);
  const segments = segmentsFromCwd(dir, home);

  const rootCanon = workspaceRoot ? canon(workspaceRoot) : null;
  const fileInsideRoot = rootCanon !== null && isUnder(canon(dir), rootCanon);

  return {
    fileName,
    segments: segments.map((s) => {
      let relation: EditorSegmentRelation = "inside-root";
      if (rootCanon !== null && fileInsideRoot) {
        const segCanon = canon(s.fullPath);
        if (segCanon === rootCanon) relation = "root";
        else if (isUnder(rootCanon, segCanon)) relation = "above-root";
      }
      return {
        label: s.label,
        fullPath: s.fullPath,
        isHome: s.isHome,
        relation,
      };
    }),
  };
}
