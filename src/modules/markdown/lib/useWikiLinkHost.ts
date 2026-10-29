import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { native } from "@/lib/native";
import { markdownIndex, markdownIndexAdd, reloadMarkdownIndex } from "@/modules/markdown/lib/mdIndex";
import type { WikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import { newWikiNotePath, resolveWikiTarget, wikiBoundary } from "@/modules/markdown/lib/wikiLinks";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";

// The markdown files under that boundary are indexed once per root and shared
// by every surface (mdIndex), so a `[[Note]]` resolves without an IO
// round-trip on every redraw. A click on a name that is not in the list
// re-indexes once (the note may have been created after the tab opened) and,
// if it is still missing, creates an empty note relative to the current one,
// as Obsidian does. The host's identity only changes with root, currentPath
// and files; onOpenFile and isFileOpen are read through refs so an app-level
// rerender cannot reconfigure the editor facet and rebuild decorations.
export type WikiNoteInfo = { path: string; workspaceRoot: string | null; isOpen: boolean };

// The editor host plus what its right-click menu needs: the note a name
// points at, and a way to open it.
export type WikiLinkMenuHost = WikiLinkHost & {
  infoFor(target: string): WikiNoteInfo | null;
  openPath(path: string): void;
};

export function useWikiLinkHost(
  currentPath: string,
  onOpenFile: ((path: string) => void) | undefined,
  isFileOpen?: (path: string) => boolean,
): WikiLinkMenuHost | undefined {
  const { workspaceRoot } = useEditorChrome();
  const root = wikiBoundary(workspaceRoot, currentPath);
  const [files, setFiles] = useState<string[]>([]);

  const rootRef = useRef(root);
  rootRef.current = root;
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  const isFileOpenRef = useRef(isFileOpen);
  isFileOpenRef.current = isFileOpen;

  const list = useCallback(async (): Promise<string[]> => {
    const fresh = await markdownIndex(root);
    if (rootRef.current === root) setFiles(fresh);
    return fresh;
  }, [root]);

  const refresh = useCallback(async (): Promise<string[]> => {
    const fresh = await reloadMarkdownIndex(root);
    if (rootRef.current === root) setFiles(fresh);
    return fresh;
  }, [root]);

  useEffect(() => {
    void list();
  }, [list]);

  return useMemo(() => {
    if (!onOpenFileRef.current) return undefined;

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
        markdownIndexAdd(root, note.path);
        setFiles((prev) => (prev.includes(note.path) ? prev : [...prev, note.path]));
        onOpenFileRef.current?.(note.path);
      } catch (err) {
        toast.error(`Could not create "${target}"`, { description: String(err) });
      }
    };

    return {
      infoFor: (target) => {
        const path = resolveWikiTarget(target, root, files);
        if (path === null) return null;
        return { path, workspaceRoot, isOpen: isFileOpenRef.current?.(path) ?? false };
      },
      openPath: (path) => onOpenFileRef.current?.(path),
      resolve: (target) => resolveWikiTarget(target, root, files),
      open: (target) => {
        const known = resolveWikiTarget(target, root, files);
        if (known) {
          onOpenFileRef.current?.(known);
          return;
        }
        void refresh().then((fresh) => {
          const found = resolveWikiTarget(target, root, fresh);
          if (found) onOpenFileRef.current?.(found);
          else void create(target);
        });
      },
    };
  }, [root, workspaceRoot, currentPath, files, list, refresh]);
}
