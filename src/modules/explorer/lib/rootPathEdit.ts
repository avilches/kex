import { isUnder } from "@/modules/workspaces/lib/explorerRoot";

export type TreeMovePlan =
  | { kind: "stay" }
  | { kind: "go"; path: string }
  | { kind: "invalid" }
  | { kind: "verify"; path: string };

const DRIVE = /^[A-Za-z]:$/;

function norm(text: string): string {
  return text.replace(/\\/g, "/");
}

function trimSlash(path: string): string {
  return path.length > 1 && !/^[A-Za-z]:\/$/.test(path)
    ? path.replace(/\/+$/, "") || "/"
    : path;
}

export function splitTypedPath(text: string): {
  folder: string | null;
  partial: string;
} {
  const t = norm(text);
  const i = t.lastIndexOf("/");
  if (i < 0) return { folder: null, partial: t };
  let folder = i === 0 ? "/" : t.slice(0, i);
  if (DRIVE.test(folder)) folder = `${folder}/`;
  return { folder, partial: t.slice(i + 1) };
}

export function expandTilde(text: string, home: string | null): string {
  if (!home || (text !== "~" && !text.startsWith("~/"))) return text;
  return norm(home).replace(/\/+$/, "") + text.slice(1);
}

// When a slash closes a folder name typed with other casing than the real one
// (case-insensitive disks), the text is rewritten with the real spelling.
export function canonicalFolderText(
  text: string,
  enteredPath: string,
): string | null {
  const { folder } = splitTypedPath(text);
  if (folder === null || !norm(text).endsWith("/")) return null;
  const f = trimSlash(folder);
  if (f === enteredPath || f.toLowerCase() !== enteredPath.toLowerCase()) {
    return null;
  }
  return enteredPath.endsWith("/") ? enteredPath : `${enteredPath}/`;
}

export function sameFolder(a: string, b: string): boolean {
  return trimSlash(norm(a)) === trimSlash(norm(b));
}

export function completeSegment(
  partial: string,
  dirNames: readonly string[],
): string | null {
  if (!partial) return null;
  const lower = partial.toLowerCase();
  const sorted = [...dirNames].sort((a, b) => a.localeCompare(b));
  return (
    sorted.find((n) => n !== partial && n.toLowerCase().startsWith(lower)) ??
    null
  );
}

function joinChild(root: string, name: string): string {
  return root.endsWith("/") ? `${root}${name}` : `${root}/${name}`;
}

export function planTreeMove(
  text: string,
  currentRoot: string,
  dirNames: readonly string[] | null,
): TreeMovePlan {
  const { folder } = splitTypedPath(text);
  if (folder === null) return { kind: "stay" };
  const f = trimSlash(folder);
  const root = trimSlash(currentRoot);
  if (trimSlash(norm(text.trim())) === root) return { kind: "stay" };
  if (f === root) return { kind: "stay" };
  if (isUnder(root, f)) return { kind: "go", path: f };
  if (isUnder(f, root)) {
    const rest = f.slice(root.endsWith("/") ? root.length : root.length + 1);
    if (rest.includes("/") || dirNames === null) {
      return { kind: "verify", path: f };
    }
    const name =
      dirNames.find((n) => n === rest) ??
      dirNames.find((n) => n.toLowerCase() === rest.toLowerCase());
    return name ? { kind: "go", path: joinChild(root, name) } : { kind: "invalid" };
  }
  return { kind: "verify", path: f };
}
