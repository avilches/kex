import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { native } from "@/lib/native";
import type { WikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import { newWikiNotePath, resolveWikiTarget, wikiBoundary } from "@/modules/markdown/lib/wikiLinks";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";

// The markdown files under that boundary, listed once per boundary, so a
// `[[Note]]` resolves without an IO round-trip on every redraw. A click on a
// name that is not in the list re-lists once (the note may have been created
// after the tab opened) and, if it is still missing, creates an empty note
// relative to the current one, as Obsidian does.
export function useWikiLinkHost(
  currentPath: string,
  onOpenFile: ((path: string) => void) | undefined,
): WikiLinkHost | undefined {
  const { workspaceRoot } = useEditorChrome();
  const root = wikiBoundary(workspaceRoot, currentPath);
  const [files, setFiles] = useState<string[]>([]);

  const list = useCallback(async (): Promise<string[]> => {
    try {
      const res = await native.glob({ pattern: "**/*.md", root, maxResults: 2000 });
      const next = res.hits.map((h) => h.path);
      setFiles(next);
      return next;
    } catch (err) {
      console.error("wiki link index failed", err);
      return [];
    }
  }, [root]);

  useEffect(() => {
    void list();
  }, [list]);

  return useMemo(() => {
    if (!onOpenFile) return undefined;

    const create = async (target: string): Promise<void> => {
      const note = newWikiNotePath(target, currentPath, root);
      if ("error" in note) {
        toast.error(
          note.error === "outside"
            ? `Cannot create "${target}" outside of ${root === workspaceRoot ? "the workspace root" : "this note's folder"}`
            : `Cannot create a note named "${target}"`,
        );
        return;
      }
      try {
        await native.createDir(note.path.replace(/\/[^/]*$/, "")).catch(() => undefined);
        await native.createFile(note.path);
        setFiles((prev) => [...prev, note.path]);
        onOpenFile(note.path);
      } catch (err) {
        toast.error(`Could not create "${target}"`, { description: String(err) });
      }
    };

    return {
      resolve: (target) => resolveWikiTarget(target, root, files),
      open: (target) => {
        const known = resolveWikiTarget(target, root, files);
        if (known) return onOpenFile(known);
        void list().then((fresh) => {
          const found = resolveWikiTarget(target, root, fresh);
          if (found) onOpenFile(found);
          else void create(target);
        });
      },
    };
  }, [root, workspaceRoot, currentPath, onOpenFile, files, list]);
}
