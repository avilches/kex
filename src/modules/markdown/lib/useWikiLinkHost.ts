import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { native } from "@/lib/native";
import type { WikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import { newWikiNotePath, resolveWikiTarget } from "@/modules/markdown/lib/wikiLinks";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";

// The workspace's markdown files, listed once per workspace root, so a
// `[[Note]]` resolves without an IO round-trip on every redraw. A click on a
// name that is not in the list re-lists once (the note may have been created
// after the tab opened) and, if it is still missing, creates an empty note
// next to the current one, as Obsidian does.
export function useWikiLinkHost(
  currentPath: string,
  onOpenFile: ((path: string) => void) | undefined,
): WikiLinkHost | undefined {
  const { workspaceRoot } = useEditorChrome();
  const [files, setFiles] = useState<string[]>([]);

  const list = useCallback(async (): Promise<string[]> => {
    if (!workspaceRoot) return [];
    try {
      const res = await native.glob({ pattern: "**/*.md", root: workspaceRoot, maxResults: 2000 });
      const next = res.hits.map((h) => h.path);
      setFiles(next);
      return next;
    } catch (err) {
      console.error("wiki link index failed", err);
      return [];
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void list();
  }, [list]);

  return useMemo(() => {
    if (!workspaceRoot || !onOpenFile) return undefined;

    const create = async (target: string): Promise<void> => {
      const path = newWikiNotePath(target, currentPath, workspaceRoot);
      if (!path) {
        toast.error(`Cannot create a note named "${target}"`);
        return;
      }
      try {
        const dir = path.replace(/\/[^/]*$/, "");
        await native.createDir(dir).catch(() => undefined);
        await native.createFile(path);
        setFiles((prev) => [...prev, path]);
        onOpenFile(path);
      } catch (err) {
        toast.error(`Could not create "${target}"`, { description: String(err) });
      }
    };

    return {
      resolve: (target) => resolveWikiTarget(target, workspaceRoot, files),
      open: (target) => {
        const known = resolveWikiTarget(target, workspaceRoot, files);
        if (known) return onOpenFile(known);
        void list().then((fresh) => {
          const found = resolveWikiTarget(target, workspaceRoot, fresh);
          if (found) onOpenFile(found);
          else void create(target);
        });
      },
    };
  }, [workspaceRoot, currentPath, onOpenFile, files, list]);
}
