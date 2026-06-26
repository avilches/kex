import { segmentsFromCwd } from "@/lib/pathUtils";
import type {
  EditorPathSegment,
  EditorSegmentRelation,
} from "@/modules/editor/lib/editorPathBreadcrumb";
import { isUnder } from "@/modules/workspaces/lib/explorerRoot";

export type PathSegment = EditorPathSegment;
export type PathSegmentRelation = EditorSegmentRelation;

function canon(p: string): string {
  const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return n === "" ? "/" : n;
}

export function buildCwdBreadcrumb(
  cwd: string,
  workspaceRoot: string | null,
  home: string | null,
): { segments: PathSegment[] } {
  const rawSegments = segmentsFromCwd(cwd, home);
  const rootCanon = workspaceRoot ? canon(workspaceRoot) : null;
  const cwdIsInsideOrAtRoot =
    rootCanon !== null && isUnder(canon(cwd), rootCanon);

  return {
    segments: rawSegments.map((s) => {
      let relation: PathSegmentRelation = "inside-root";
      if (rootCanon !== null) {
        const segCanon = canon(s.fullPath);
        if (segCanon === rootCanon) {
          relation = "root";
        } else if (isUnder(rootCanon, segCanon)) {
          relation = "above-root";
        } else if (!cwdIsInsideOrAtRoot) {
          // cwd is outside the root: no segment is inside it
          relation = "above-root";
        }
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
