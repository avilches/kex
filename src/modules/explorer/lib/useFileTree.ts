import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { pathDirname, pathBasename } from "@/lib/pathUtils";
import { native } from "@/lib/native";
import { suggestDuplicateName } from "@/modules/explorer/lib/duplicateName";
import { isCopying } from "@/modules/explorer/lib/duplicateStore";
import { removedChildDirs } from "@/modules/explorer/lib/treePrune";
import {
  type ClipboardEntry,
  planPaste,
  resolveDestDir,
} from "@/modules/explorer/lib/clipboardPaste";
import { listenFsChanged, watchAdd, watchRemove } from "./watch";

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
};

type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: DirEntry[] }
  | { status: "error"; message: string };

type TreeState = Record<string, ChildrenState>;

export type PendingCreate = {
  parentPath: string;
  kind: "file" | "dir";
  afterPath?: string;
};

export type PendingDuplicate = {
  sourcePath: string;
  parentPath: string;
  kind: "file" | "dir";
  suggestedName: string;
};

export function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

export const dirname = pathDirname;

const EXPANSION_CACHE_LIMIT = 8;
const expansionCache = new Map<string, string[]>();

function rememberExpansion(root: string, expanded: Set<string>): void {
  expansionCache.delete(root);
  if (expanded.size > 0) expansionCache.set(root, [...expanded]);
  while (expansionCache.size > EXPANSION_CACHE_LIMIT) {
    const oldest = expansionCache.keys().next().value;
    if (oldest === undefined) break;
    expansionCache.delete(oldest);
  }
}

function recallExpansion(root: string): string[] {
  const v = expansionCache.get(root);
  if (!v) return [];
  expansionCache.delete(root);
  expansionCache.set(root, v);
  return v;
}

function isUnder(key: string, root: string): boolean {
  return key === root || key.startsWith(`${root}/`);
}

// mtime/size are ignored on purpose: the tree never renders them, so a watcher
// refetch that only bumps mtime (saving a file) must not count as a change.
function sameDirListing(a: DirEntry[], b: DirEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].kind !== b[i].kind ||
      a[i].gitignored !== b[i].gitignored
    )
      return false;
  }
  return true;
}

type Options = {
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  showHidden?: boolean;
};

export function useFileTree(rootPath: string | null, options?: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const showHidden = options?.showHidden ?? false;
  const showHiddenRef = useRef(showHidden);
  const keepLayout = usePreferencesStore(
    (s) => s.keepFolderLayoutOnChangeExplorerRoot,
  );
  const keepLayoutRef = useRef(keepLayout);
  const gitDecorationsRef = useRef(true);
  const [nodes, setNodes] = useState<TreeState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );
  const [pendingDuplicate, setPendingDuplicate] =
    useState<PendingDuplicate | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);
  const clipboardRef = useRef<ClipboardEntry | null>(null);
  clipboardRef.current = clipboard;

  const expandedRef = useRef(expanded);
  const nodesRef = useRef(nodes);
  const watchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    showHiddenRef.current = showHidden;
  }, [showHidden]);

  useEffect(() => {
    keepLayoutRef.current = keepLayout;
  }, [keepLayout]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const addWatch = useCallback((path: string) => {
    if (watchedRef.current.has(path)) return;
    watchedRef.current.add(path);
    watchAdd([path]);
  }, []);

  const removeWatch = useCallback((path: string) => {
    if (!watchedRef.current.delete(path)) return;
    watchRemove([path]);
  }, []);

  const fetchChildren = useCallback(async (path: string) => {
    if (nodesRef.current[path]?.status !== "loaded") {
      setNodes((s) => ({ ...s, [path]: { status: "loading" } }));
    }
    try {
      // Capture once so the prune decision uses the same visibility the listing
      // was taken with, even if the preference flips during the await.
      const showHidden = showHiddenRef.current;
      const entries = await invoke<DirEntry[]>("fs_read_dir", {
        path,
        showHidden,
        gitDecorations: gitDecorationsRef.current,
        workspace: currentWorkspaceEnv(),
      });

      const prev = nodesRef.current[path];
      if (prev?.status === "loaded" && sameDirListing(prev.entries, entries)) {
        return;
      }

      const liveDirs = new Set(
        entries.filter((e) => e.kind === "dir").map((e) => joinPath(path, e.name)),
      );
      const removedRoots = removedChildDirs(
        path,
        liveDirs,
        Object.keys(nodesRef.current),
        showHidden,
      );
      const dead = new Set<string>();
      if (removedRoots.length > 0) {
        const candidates = new Set<string>([
          ...Object.keys(nodesRef.current),
          ...expandedRef.current,
          ...watchedRef.current,
        ]);
        for (const k of candidates) {
          if (removedRoots.some((r) => isUnder(k, r))) dead.add(k);
        }
      }

      setNodes((s) => {
        const next: TreeState = {};
        for (const [k, v] of Object.entries(s)) if (!dead.has(k)) next[k] = v;
        next[path] = { status: "loaded", entries };
        return next;
      });

      if (dead.size > 0) {
        setExpanded((c) => {
          let changed = false;
          const n = new Set(c);
          for (const d of dead) if (n.delete(d)) changed = true;
          return changed ? n : c;
        });
        const toUnwatch: string[] = [];
        for (const d of dead) if (watchedRef.current.delete(d)) toUnwatch.push(d);
        watchRemove(toUnwatch);
      }
    } catch (e) {
      setNodes((s) => ({
        ...s,
        [path]: { status: "error", message: String(e) },
      }));
    }
  }, []);

  // Root change → restore the cached expansion for this root, re-scope watches,
  // and persist the outgoing root's expansion on the way out.
  useEffect(() => {
    if (!rootPath) {
      setNodes({});
      setExpanded(new Set());
      setPendingCreate(null);
      setPendingDuplicate(null);
      setRenaming(null);
      return;
    }
    setPendingCreate(null);
    setPendingDuplicate(null);
    setRenaming(null);

    const restored = keepLayoutRef.current ? recallExpansion(rootPath) : [];
    setExpanded(new Set(restored));
    setNodes({});

    const toWatch = [rootPath, ...restored];
    void fetchChildren(rootPath);
    for (const d of restored) void fetchChildren(d);
    for (const p of toWatch) watchedRef.current.add(p);
    watchAdd(toWatch);

    return () => {
      rememberExpansion(rootPath, expandedRef.current);
      if (watchedRef.current.size > 0) {
        watchRemove([...watchedRef.current]);
        watchedRef.current.clear();
      }
    };
  }, [rootPath, fetchChildren]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listenFsChanged((paths) => {
      const current = nodesRef.current;
      const dirs = new Set<string>();
      for (const p of paths) {
        const parent = dirname(p);
        if (current[parent]?.status === "loaded") dirs.add(parent);
        if (current[p]?.status === "loaded") dirs.add(p);
      }
      for (const d of dirs) void fetchChildren(d);
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [fetchChildren]);

  useEffect(() => {
    if (!rootPath) return;
    const loadedPaths = Object.entries(nodes)
      .filter(([, state]) => state.status === "loaded")
      .map(([path]) => path);
    for (const path of loadedPaths) void fetchChildren(path);
    // Re-list loaded directories when visibility prefs change.
    // `nodes` is intentionally omitted so ordinary tree edits don't refetch
    // every expanded directory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden, rootPath, fetchChildren]);

  const toggle = useCallback(
    (path: string) => {
      if (expandedRef.current.has(path)) {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.delete(path);
          return next;
        });
        removeWatch(path);
      } else {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.add(path);
          return next;
        });
        addWatch(path);
        void fetchChildren(path);
      }
    },
    [fetchChildren, addWatch, removeWatch],
  );

  const expand = useCallback(
    (path: string) => {
      if (expandedRef.current.has(path)) return;
      setExpanded((curr) => {
        const next = new Set(curr);
        next.add(path);
        return next;
      });
      addWatch(path);
      void fetchChildren(path);
    },
    [fetchChildren, addWatch],
  );

  const refresh = useCallback(
    (path: string) => {
      void fetchChildren(path);
    },
    [fetchChildren],
  );

  // --- mutations ---

  const beginCreate = useCallback(
    (parentPath: string, kind: "file" | "dir", afterPath?: string) => {
      setRenaming(null);
      setPendingDuplicate(null);
      setPendingCreate({ parentPath, kind, afterPath });
      // Ensure the parent is expanded so the input row is visible.
      if (rootPath && parentPath !== rootPath) {
        setExpanded((curr) => {
          if (curr.has(parentPath)) return curr;
          const next = new Set(curr);
          next.add(parentPath);
          return next;
        });
        addWatch(parentPath);
      }
      setNodes((curr) => {
        if (!curr[parentPath]) void fetchChildren(parentPath);
        return curr;
      });
    },
    [rootPath, fetchChildren, addWatch],
  );

  const cancelCreate = useCallback(() => setPendingCreate(null), []);

  const commitCreate = useCallback(
    async (name: string) => {
      if (!pendingCreate) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setPendingCreate(null);
        return;
      }
      const path = joinPath(pendingCreate.parentPath, trimmed);
      const cmd =
        pendingCreate.kind === "dir" ? "fs_create_dir" : "fs_create_file";
      try {
        await invoke(cmd, { path, workspace: currentWorkspaceEnv() });
        await fetchChildren(pendingCreate.parentPath);
      } catch (e) {
        console.error(`${cmd} failed:`, e);
        toast.error(`Failed to create ${pendingCreate.kind}: ${trimmed}`, {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setPendingCreate(null);
      }
    },
    [pendingCreate, fetchChildren],
  );

  const beginDuplicate = useCallback(
    (sourcePath: string, kind: "file" | "dir") => {
      if (isCopying()) {
        toast.error("A duplication is already in progress");
        return;
      }
      setRenaming(null);
      setPendingCreate(null);
      // Collapse the folder first so the name input lands cleanly below the
      // folder row instead of between it and its children.
      if (kind === "dir") {
        setExpanded((curr) => {
          if (!curr.has(sourcePath)) return curr;
          const next = new Set(curr);
          next.delete(sourcePath);
          return next;
        });
      }
      const parts = sourcePath.split(/[\\/]/);
      const baseName = parts[parts.length - 1] ?? sourcePath;
      const parentPath = sourcePath.slice(
        0,
        sourcePath.length - baseName.length - 1,
      );
      const loaded = nodes[parentPath];
      const siblings =
        loaded?.status === "loaded" ? loaded.entries.map((e) => e.name) : [];
      const suggestedName = suggestDuplicateName(baseName, kind, siblings);
      setPendingDuplicate({ sourcePath, parentPath, kind, suggestedName });
    },
    [nodes],
  );

  const cancelDuplicate = useCallback(() => setPendingDuplicate(null), []);

  const commitDuplicate = useCallback(
    async (name: string) => {
      if (!pendingDuplicate) return;
      const trimmed = name.trim();
      const { sourcePath, parentPath } = pendingDuplicate;
      if (!trimmed) {
        setPendingDuplicate(null);
        return;
      }
      const loaded = nodes[parentPath];
      const siblings =
        loaded?.status === "loaded" ? loaded.entries.map((e) => e.name) : [];
      if (siblings.includes(trimmed)) {
        toast.error(`Already exists: ${trimmed}`);
        setPendingDuplicate(null);
        return;
      }
      if (isCopying()) {
        toast.error("A duplication is already in progress");
        setPendingDuplicate(null);
        return;
      }
      setPendingDuplicate(null);
      const dest = joinPath(parentPath, trimmed);
      try {
        await native.duplicate(sourcePath, dest);
        await fetchChildren(parentPath);
      } catch (e) {
        console.error("fs_duplicate failed:", e);
        toast.error(`Failed to duplicate ${trimmed}`);
      }
    },
    [pendingDuplicate, nodes, fetchChildren],
  );

  const copyEntry = useCallback((path: string, kind: "file" | "dir") => {
    setClipboard({ path, kind, mode: "copy" });
  }, []);

  const cutEntry = useCallback((path: string, kind: "file" | "dir") => {
    setClipboard({ path, kind, mode: "cut" });
  }, []);

  const expandDir = (dir: string) =>
    setExpanded((curr) => {
      if (curr.has(dir)) return curr;
      const next = new Set(curr);
      next.add(dir);
      return next;
    });

  const pasteEntry = useCallback(
    async (targetPath: string, targetIsDir: boolean) => {
      const clip = clipboardRef.current;
      if (!clip) return;
      if (isCopying()) {
        toast.error("A copy is already in progress");
        return;
      }
      const destDir = resolveDestDir(targetPath, targetIsDir);

      let existingNames: string[] = [];
      try {
        const entries = await invoke<DirEntry[]>("fs_read_dir", {
          path: destDir,
          showHidden: true,
          gitDecorations: false,
          workspace: currentWorkspaceEnv(),
        });
        existingNames = entries.map((e) => e.name);
      } catch (e) {
        console.error("fs_read_dir (paste) failed:", e);
        toast.error("Failed to read the destination folder");
        return;
      }

      const plan = planPaste(clip, destDir, existingNames);
      const baseName = pathBasename(clip.path);

      if (plan.action === "error") {
        toast.error(
          plan.reason === "self-nest"
            ? "Cannot paste a folder into itself"
            : `Already exists: ${baseName}`,
        );
        return;
      }
      if (plan.action === "noop") {
        setClipboard(null);
        return;
      }

      const dest = joinPath(destDir, plan.name);

      if (plan.action === "copy") {
        try {
          await native.duplicate(clip.path, dest);
          await fetchChildren(destDir);
          expandDir(destDir);
        } catch (e) {
          console.error("fs_duplicate (paste) failed:", e);
          toast.error(`Failed to paste ${baseName}`);
        }
        return;
      }

      try {
        await native.renameFile(clip.path, dest);
        optionsRef.current?.onPathRenamed?.(clip.path, dest);
        await Promise.all([
          fetchChildren(dirname(clip.path)),
          fetchChildren(destDir),
        ]);
        expandDir(destDir);
        setClipboard(null);
      } catch (e) {
        console.error("fs_rename (paste) failed:", e);
        toast.error(`Failed to move ${baseName}`);
      }
    },
    [fetchChildren],
  );

  const beginRename = useCallback((path: string) => {
    setPendingCreate(null);
    setPendingDuplicate(null);
    setRenaming(path);
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const commitRename = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      const trimmed = newName.trim();
      const parent = dirname(renaming);
      const oldName = renaming.slice(parent === "/" ? 1 : parent.length + 1);
      if (!trimmed || trimmed === oldName) {
        setRenaming(null);
        return;
      }
      const to = joinPath(parent, trimmed);
      try {
        await native.renameFile(renaming, to);
        optionsRef.current?.onPathRenamed?.(renaming, to);
        await fetchChildren(parent);
      } catch (e) {
        console.error("fs_rename failed:", e);
        toast.error(`Failed to rename to "${trimmed}"`, {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setRenaming(null);
      }
    },
    [renaming, fetchChildren],
  );

  const deletePath = useCallback(
    async (path: string) => {
      try {
        await invoke("fs_delete", { path, workspace: currentWorkspaceEnv() });
        optionsRef.current?.onPathDeleted?.(path);
        await fetchChildren(dirname(path));
      } catch (e) {
        console.error("fs_delete failed:", e);
        toast.error(`Failed to delete "${pathBasename(path)}"`, {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [fetchChildren],
  );

  const trashPath = useCallback(
    async (path: string) => {
      try {
        await invoke("fs_trash", { path, workspace: currentWorkspaceEnv() });
        optionsRef.current?.onPathDeleted?.(path);
        await fetchChildren(dirname(path));
      } catch (e) {
        console.error("fs_trash failed:", e);
        toast.error(`Failed to move "${pathBasename(path)}" to trash`, {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [fetchChildren],
  );

  const movePath = useCallback(
    async (from: string, toDir: string) => {
      const name = pathBasename(from);
      const to = joinPath(toDir, name);
      if (to === from) return;
      const target = nodesRef.current[toDir];
      if (
        target?.status === "loaded" &&
        target.entries.some((e) => e.name === name)
      ) {
        console.warn(`move skipped: "${name}" already exists in ${toDir}`);
        return;
      }
      try {
        await native.renameFile(from, to);
        optionsRef.current?.onPathRenamed?.(from, to);
        await Promise.all([fetchChildren(dirname(from)), fetchChildren(toDir)]);
      } catch (e) {
        console.error("fs_rename (move) failed:", e);
        toast.error(`Failed to move "${name}" to "${toDir}"`, {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [fetchChildren],
  );

  return {
    nodes,
    expanded,
    pendingCreate,
    pendingDuplicate,
    renaming,
    clipboard,
    toggle,
    expand,
    refresh,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginDuplicate,
    cancelDuplicate,
    commitDuplicate,
    copyEntry,
    cutEntry,
    pasteEntry,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    trashPath,
    movePath,
    joinPath,
  };
}
