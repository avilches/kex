import { pathBasename, pathDirname } from "@/lib/pathUtils";
import { suggestDuplicateName } from "@/modules/explorer/lib/duplicateName";

export type ClipboardEntry = {
  path: string;
  kind: "file" | "dir";
  mode: "copy" | "cut";
};

export type PastePlan =
  | { action: "copy"; name: string }
  | { action: "move"; name: string }
  | { action: "noop" }
  | { action: "error"; reason: "self-nest" | "exists" };

export function resolveDestDir(
  targetPath: string,
  targetIsDir: boolean,
): string {
  return targetIsDir ? targetPath : pathDirname(targetPath);
}

export function planPaste(
  clip: ClipboardEntry,
  destDir: string,
  existingNames: string[],
): PastePlan {
  if (
    clip.kind === "dir" &&
    (destDir === clip.path || destDir.startsWith(`${clip.path}/`))
  ) {
    return { action: "error", reason: "self-nest" };
  }

  const baseName = pathBasename(clip.path);

  if (clip.mode === "copy") {
    const name = existingNames.includes(baseName)
      ? suggestDuplicateName(baseName, clip.kind, existingNames)
      : baseName;
    return { action: "copy", name };
  }

  if (destDir === pathDirname(clip.path)) {
    return { action: "noop" };
  }
  if (existingNames.includes(baseName)) {
    return { action: "error", reason: "exists" };
  }
  return { action: "move", name: baseName };
}
