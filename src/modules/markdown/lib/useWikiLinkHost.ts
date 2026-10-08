import { useCallback, useEffect, useMemo, useState } from "react";
import { native } from "@/lib/native";
import type { WikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import { resolveWikiTarget } from "@/modules/markdown/lib/wikiLinks";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";

// The workspace's markdown files, listed once per workspace root, so a
// `[[Note]]` resolves without an IO round-trip on every redraw. A click on a
// name that is not in the list re-lists once before giving up, since the note
// may have been created after the tab opened.
export function useWikiLinkHost(onOpenFile: ((path: string) => void) | undefined): WikiLinkHost | undefined {
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
    return {
      resolve: (target) => resolveWikiTarget(target, workspaceRoot, files),
      open: (target) => {
        const known = resolveWikiTarget(target, workspaceRoot, files);
        if (known) return onOpenFile(known);
        void list().then((fresh) => {
          const found = resolveWikiTarget(target, workspaceRoot, fresh);
          if (found) onOpenFile(found);
        });
      },
    };
  }, [workspaceRoot, onOpenFile, files, list]);
}
