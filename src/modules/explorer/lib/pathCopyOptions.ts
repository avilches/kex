import { relativeCopyFor } from "./relativeCopy";

export type PathCopyKind = "absolute" | "workspace" | "repository" | "relative";

export type PathCopyOption = {
  kind: PathCopyKind;
  label: string;
  text: string;
  toast: string;
};

export type PathCopyBases = {
  workspaceRoot: string | null;
  repoRoot: string | null;
  // Only the explorer offers it: the root it shows, which is not always the workspace root.
  relativeRoot?: string | null;
};

const META: Record<PathCopyKind, { label: string; toast: string }> = {
  absolute: { label: "Absolute Path", toast: "Copied absolute path" },
  workspace: { label: "Workspace Path", toast: "Copied workspace path" },
  repository: { label: "Repository Path", toast: "Copied repository path" },
  relative: { label: "Relative Path", toast: "Copied relative path" },
};

function option(kind: PathCopyKind, text: string): PathCopyOption {
  return { kind, text, ...META[kind] };
}

// An entry is offered only when it can be computed. The root itself would copy ".", which says nothing.
function against(kind: PathCopyKind, path: string, root: string | null | undefined) {
  if (root == null) return [];
  const rel = relativeCopyFor(path, root);
  return rel.ok && rel.text !== "." ? [option(kind, rel.text)] : [];
}

export function pathCopyOptions(path: string, bases: PathCopyBases): PathCopyOption[] {
  return [
    option("absolute", path),
    ...against("workspace", path, bases.workspaceRoot),
    ...against("repository", path, bases.repoRoot),
    ...against("relative", path, bases.relativeRoot),
  ];
}
