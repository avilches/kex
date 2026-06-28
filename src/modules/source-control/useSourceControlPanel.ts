import {
  native,
  type GitBranchInfo,
  type GitChangedFile,
  type GitDiscardEntry,
  type GitRemoteInfo,
  type GitRepoInfo,
  type GitStatusSnapshot,
  type GitWorktreeStatus,
} from "@/lib/native";
import {
  invalidateDiff,
  invalidateRepoDiffs,
  workingDiffKey,
} from "@/modules/editor/lib/diffCache";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceControlSummary } from "./useSourceControl";

type PanelState = "closed" | "loading" | "no-repo" | "ready" | "error";
type DiffMode = "+" | "-";
type SelectionTransition = "none" | "moved-group" | "reset";

const RECONCILE_DEBOUNCE_MS = 180;
const COMMIT_PERSIST_DEBOUNCE_MS = 400;

export type DiffSelection = {
  path: string;
  mode: DiffMode;
};

export type SourceControlEntry = {
  key: string;
  path: string;
  mode: DiffMode;
  indexStatus: string;
  worktreeStatus: string;
  statusLabel: string;
  statusCode: string;
  originalPath: string | null;
  untracked: boolean;
};


export type PendingDiscard =
  | { scope: "single"; count: 1; label: string; untracked: boolean }
  | { scope: "all"; count: number; label: string; untrackedCount: number };

type SourceControlPanelState = {
  panelState: PanelState;
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  selected: DiffSelection | null;
  commitMessage: string;
  actionBusy: string | null;
  statusError: string | null;
  actionError: string | null;
  remoteError: string | null;
  actionMessage: string | null;
  dismissFeedback: () => void;
  stagedEntries: SourceControlEntry[];
  unstagedEntries: SourceControlEntry[];
  allClean: boolean;
  canPush: boolean;
  pushHint: string | null;
  selectionTransition: SelectionTransition;
  pendingDiscard: PendingDiscard | null;
  remotes: GitRemoteInfo[];
  remotesLoading: boolean;
  selectedRemote: string | null;
  setSelectedRemote: (name: string) => void;
  fetchBranches: () => Promise<GitBranchInfo[]>;
  fetchWorktrees: () => Promise<import("@/lib/native").GitWorktreeInfo[]>;
  checkout: (branch: GitBranchInfo) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  addRemote: (name: string, url: string) => Promise<void>;
  worktreeName: string | null;
  worktreeCount: number;
  setCommitMessage: (value: string) => void;
  refresh: () => Promise<void>;
  selectEntry: (entry: SourceControlEntry) => Promise<void>;
  stageEntry: (entry: SourceControlEntry) => Promise<void>;
  unstageEntry: (entry: SourceControlEntry) => Promise<void>;
  requestDiscardEntry: (entry: SourceControlEntry) => void;
  requestDiscardAll: () => void;
  confirmPendingDiscard: () => Promise<void>;
  cancelPendingDiscard: () => void;
  stageAllEntries: () => Promise<void>;
  unstageAllEntries: () => Promise<void>;
  stageEntries: (entries: SourceControlEntry[]) => Promise<void>;
  unstageEntries: (entries: SourceControlEntry[]) => Promise<void>;
  requestDiscardEntries: (entries: SourceControlEntry[]) => void;
  commit: () => Promise<void>;
  push: () => Promise<void>;
  commitAndPush: () => Promise<void>;
};

function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown source control error";
}

function normalizeStatusCode(status: string): string {
  const code = status.trim().toUpperCase();
  switch (code) {
    case "?":
      return "U";
    case "A":
      return "A";
    case "M":
      return "M";
    case "D":
      return "D";
    case "R":
    case "C":
      return "R";
    case "U":
      return "U";
    default:
      return code || "M";
  }
}

function statusCodeForMode(mode: DiffMode, file: GitChangedFile): string {
  if (mode === "-" && file.untracked) return "U";
  const primary = mode === "+" ? file.indexStatus : file.worktreeStatus;
  const fallback = mode === "+" ? file.worktreeStatus : file.indexStatus;
  return normalizeStatusCode(primary !== " " ? primary : fallback);
}

function makeEntry(
  path: string,
  mode: DiffMode,
  file: GitChangedFile,
): SourceControlEntry {
  return {
    key: `${mode}:${path}`,
    path,
    mode,
    indexStatus: file.indexStatus,
    worktreeStatus: file.worktreeStatus,
    statusLabel: file.statusLabel,
    statusCode: statusCodeForMode(mode, file),
    originalPath: file.originalPath,
    untracked: file.untracked,
  };
}

function sameSelection(
  a: DiffSelection | null,
  b: DiffSelection | null,
): boolean {
  return !!a && !!b && a.path === b.path && a.mode === b.mode;
}

function optimisticStage(
  status: GitStatusSnapshot,
  paths: Set<string>,
): GitStatusSnapshot {
  let changed = false;
  const next = status.changedFiles.map((file) => {
    if (!paths.has(file.path)) return file;
    if (file.staged && !file.unstaged) return file;
    changed = true;
    const wt = file.worktreeStatus !== " " ? file.worktreeStatus : file.indexStatus;
    return {
      ...file,
      indexStatus: wt,
      worktreeStatus: " ",
      staged: true,
      unstaged: false,
      untracked: false,
    };
  });
  if (!changed) return status;
  return { ...status, changedFiles: next };
}

function optimisticUnstage(
  status: GitStatusSnapshot,
  paths: Set<string>,
): GitStatusSnapshot {
  let changed = false;
  const next: GitChangedFile[] = [];
  for (const file of status.changedFiles) {
    if (!paths.has(file.path)) {
      next.push(file);
      continue;
    }
    if (!file.staged && file.unstaged) {
      next.push(file);
      continue;
    }
    changed = true;
    const idx = file.indexStatus !== " " ? file.indexStatus : file.worktreeStatus;
    if (idx === "R" && file.originalPath) {
      next.push({
        path: file.originalPath,
        originalPath: null,
        indexStatus: " ",
        worktreeStatus: "D",
        staged: false,
        unstaged: true,
        untracked: false,
        statusLabel: "Deleted",
      });
      next.push({
        path: file.path,
        originalPath: null,
        indexStatus: " ",
        worktreeStatus: "?",
        staged: false,
        unstaged: true,
        untracked: true,
        statusLabel: "Untracked",
      });
      continue;
    }
    next.push({
      ...file,
      originalPath: null,
      indexStatus: " ",
      worktreeStatus: idx === "A" ? "?" : idx,
      staged: false,
      unstaged: true,
      untracked: idx === "A",
    });
  }
  if (!changed) return status;
  return { ...status, changedFiles: next };
}

function optimisticDiscard(
  status: GitStatusSnapshot,
  paths: Set<string>,
): GitStatusSnapshot {
  let changed = false;
  const next: GitChangedFile[] = [];
  for (const file of status.changedFiles) {
    if (!paths.has(file.path)) {
      next.push(file);
      continue;
    }
    if (file.staged) {
      changed = true;
      next.push({
        ...file,
        worktreeStatus: " ",
        unstaged: false,
        untracked: false,
      });
    } else {
      changed = true;
    }
  }
  if (!changed) return status;
  return { ...status, changedFiles: next };
}

type CommitDraftParams = {
  workspaceId: string | null;
  savedCommitMessage: string;
  onPersist: (workspaceId: string, message: string) => void;
};

export function useSourceControlPanel(
  isOpen: boolean,
  summary: SourceControlSummary,
  onOpenDiff:
    | ((input: {
        path: string;
        repoRoot: string;
        mode: DiffMode;
        originalPath: string | null;
        title?: string;
      }) => void)
    | null,
  commitDraft: CommitDraftParams,
): SourceControlPanelState {
  const [panelState, setPanelState] = useState<PanelState>("closed");
  const [repo, setRepo] = useState<GitRepoInfo | null>(null);
  const [status, setStatus] = useState<GitStatusSnapshot | null>(null);
  const [selected, setSelected] = useState<DiffSelection | null>(null);
  const [commitMessage, setCommitMessageState] = useState(
    commitDraft.savedCommitMessage,
  );
  const commitDraftRef = useRef(commitMessage);
  const commitWorkspaceIdRef = useRef(commitDraft.workspaceId);
  const persistCommitRef = useRef(commitDraft.onPersist);
  persistCommitRef.current = commitDraft.onPersist;
  const commitPersistTimerRef = useRef(0);

  const flushCommitMessage = useCallback(() => {
    if (commitPersistTimerRef.current) {
      window.clearTimeout(commitPersistTimerRef.current);
      commitPersistTimerRef.current = 0;
    }
    const workspaceId = commitWorkspaceIdRef.current;
    if (workspaceId) persistCommitRef.current(workspaceId, commitDraftRef.current);
  }, []);

  const setCommitMessage = useCallback((value: string) => {
    commitDraftRef.current = value;
    setCommitMessageState(value);
    if (commitPersistTimerRef.current) {
      window.clearTimeout(commitPersistTimerRef.current);
    }
    commitPersistTimerRef.current = window.setTimeout(() => {
      commitPersistTimerRef.current = 0;
      const workspaceId = commitWorkspaceIdRef.current;
      if (workspaceId)
        persistCommitRef.current(workspaceId, commitDraftRef.current);
    }, COMMIT_PERSIST_DEBOUNCE_MS);
  }, []);

  // On workspace switch, flush the previous draft and load the new workspace's
  // saved message. Same-workspace saved-message changes (echoed back from our
  // own persist) are ignored so they never clobber the live draft.
  useEffect(() => {
    if (commitWorkspaceIdRef.current === commitDraft.workspaceId) return;
    flushCommitMessage();
    commitWorkspaceIdRef.current = commitDraft.workspaceId;
    commitDraftRef.current = commitDraft.savedCommitMessage;
    setCommitMessageState(commitDraft.savedCommitMessage);
  }, [commitDraft.workspaceId, commitDraft.savedCommitMessage, flushCommitMessage]);

  useEffect(() => () => flushCommitMessage(), [flushCommitMessage]);
  const [localActionBusy, setLocalActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectionTransition, setSelectionTransition] =
    useState<SelectionTransition>("none");

  // Footer feedback is an ephemeral toast. Its source state (actionError,
  // actionMessage, remoteError) outlives the toast and even the panel mount, so
  // it must be cleared once the toast has been shown or the panel stops showing
  // it, otherwise it re-fires every time CommitFeedback remounts (tab switch or
  // right-panel collapse).
  const dismissFeedback = useCallback(() => {
    setActionError(null);
    setActionMessage(null);
    summary.clearRemoteError();
  }, [summary.clearRemoteError]);
  const [pendingDiscard, setPendingDiscard] = useState<
    | { scope: "single"; entry: SourceControlEntry }
    | { scope: "all"; entries: SourceControlEntry[] }
    | null
  >(null);
  const [remotes, setRemotes] = useState<GitRemoteInfo[]>([]);
  const [remotesLoading, setRemotesLoading] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
  const [worktreeStatus, setWorktreeStatus] = useState<GitWorktreeStatus>({
    worktreeName: null,
    worktreeCount: 0,
  });
  const selectedRef = useRef<DiffSelection | null>(null);
  const reconcileTimerRef = useRef(0);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const stagedEntries = useMemo(
    () =>
      (status?.changedFiles ?? [])
        .filter((file) => file.staged)
        .map((file) => makeEntry(file.path, "+", file)),
    [status],
  );

  const unstagedEntries = useMemo(
    () =>
      (status?.changedFiles ?? [])
        .filter((file) => file.unstaged)
        .map((file) => makeEntry(file.path, "-", file)),
    [status],
  );


  const allClean = stagedEntries.length === 0 && unstagedEntries.length === 0;
  const canPush =
    !!status?.upstream && status.behind === 0 && status.ahead > 0;
  const pushHint = useMemo(() => {
    if (!status) return null;
    if (!status.upstream) {
      return "Configure or publish this branch in the terminal to enable push in this iteration.";
    }
    if (status.behind > 0) {
      return "Pull remote changes before pushing local commits.";
    }
    if (status.ahead === 0) {
      return `No local commits to push to ${status.upstream}.`;
    }
    return `Pushes to ${status.upstream}.`;
  }, [status]);

  const cancelReconcile = useCallback(() => {
    if (reconcileTimerRef.current) {
      window.clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = 0;
    }
  }, []);

  const scheduleReconcile = useCallback(() => {
    cancelReconcile();
    reconcileTimerRef.current = window.setTimeout(() => {
      reconcileTimerRef.current = 0;
      void summary.refresh({ remote: "never" });
    }, RECONCILE_DEBOUNCE_MS);
  }, [cancelReconcile, summary]);

  useEffect(() => () => cancelReconcile(), [cancelReconcile]);

  const loadRemotes = useCallback(async () => {
    if (!repo) return;
    setRemotesLoading(true);
    try {
      const list = await native.gitListRemotes(repo.repoRoot);
      setRemotes(list);
      setSelectedRemote((current) => {
        if (current && list.some((r) => r.name === current)) return current;
        const trackingRemote = status?.upstream?.split("/")[0] ?? null;
        return (
          list.find((r) => r.name === trackingRemote)?.name ??
          list[0]?.name ??
          null
        );
      });
    } catch {
      setRemotes([]);
    } finally {
      setRemotesLoading(false);
    }
  }, [repo, status?.upstream]);

  const loadWorktreeStatus = useCallback(async () => {
    if (!repo) return;
    try {
      setWorktreeStatus(await native.gitWorktreeStatus(repo.repoRoot));
    } catch {
      // non-fatal
    }
  }, [repo]);

  const fetchBranches = useCallback(async (): Promise<GitBranchInfo[]> => {
    if (!repo) return [];
    return native.gitListBranches(repo.repoRoot);
  }, [repo]);

  const fetchWorktrees = useCallback(async () => {
    if (!repo) return [];
    return native.gitListWorktrees(repo.repoRoot);
  }, [repo]);

  const checkout = useCallback(
    async (branch: GitBranchInfo) => {
      if (!repo) return;
      setLocalActionBusy("checkout");
      setActionMessage(null);
      setActionError(null);
      try {
        await native.gitCheckoutBranch(repo.repoRoot, branch.name);
        const localName = branch.isRemote
          ? branch.name.slice(branch.name.indexOf("/") + 1)
          : branch.name;
        setActionMessage(`Switched to ${localName}`);
        await summary.refresh({ remote: "never" });
      } catch (error) {
        setActionError(normalizeError(error));
        throw error;
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo, summary],
  );

  const createBranch = useCallback(
    async (name: string) => {
      if (!repo) return;
      setLocalActionBusy("create-branch");
      setActionMessage(null);
      setActionError(null);
      try {
        await native.gitCreateBranch(repo.repoRoot, name);
        setActionMessage(`Created and switched to ${name}`);
        await summary.refresh({ remote: "never" });
      } catch (error) {
        setActionError(normalizeError(error));
        throw error;
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo, summary],
  );

  const addRemote = useCallback(
    async (name: string, url: string) => {
      if (!repo) return;
      setLocalActionBusy("add-remote");
      setActionMessage(null);
      setActionError(null);
      try {
        await native.gitAddRemote(repo.repoRoot, name, url);
        const list = await native.gitListRemotes(repo.repoRoot);
        setRemotes(list);
        setSelectedRemote(name);
        setActionMessage(`Remote "${name}" added`);
      } catch (error) {
        setActionError(normalizeError(error));
        throw error;
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo],
  );

  const openSelection = useCallback(
    (sel: DiffSelection, repoRoot: string, file: GitChangedFile | undefined) => {
      onOpenDiff?.({
        path: sel.path,
        repoRoot,
        mode: sel.mode,
        originalPath: file?.originalPath ?? null,
      });
    },
    [onOpenDiff],
  );

  const refresh = useCallback(async () => {
    if (!isOpen) {
      setPanelState("closed");
      setSelectionTransition("none");
      return;
    }
    if (summary.repo) invalidateRepoDiffs(summary.repo.repoRoot);
    await summary.refresh({ remote: "never" });
    void loadRemotes();
    void loadWorktreeStatus();
  }, [isOpen, summary, loadRemotes, loadWorktreeStatus]);

  useEffect(() => {
    if (!isOpen) {
      setPanelState("closed");
      setSelectionTransition("none");
      dismissFeedback();
      return;
    }
    if (summary.isLoading && !summary.hasRepo && !summary.status) {
      setPanelState("loading");
      return;
    }
    if (!summary.hasRepo) {
      setRepo(null);
      setStatus(null);
      setSelected(null);
      setPanelState("no-repo");
      setSelectionTransition("none");
      return;
    }
    if (summary.localError && !summary.status) {
      setRepo(summary.repo);
      setStatus(null);
      setSelected(null);
      setPanelState("error");
      setSelectionTransition("none");
      return;
    }
    if (!summary.repo || !summary.status) {
      if (summary.isLoading) {
        setPanelState("loading");
      }
      return;
    }

    setRepo(summary.repo);
    setStatus(summary.status);
    setPanelState("ready");

    const current = selectedRef.current;
    const exists =
      !!current &&
      summary.status.changedFiles.some((file) => {
        if (file.path !== current.path) return false;
        return current.mode === "+" ? file.staged : file.unstaged;
      });

    if (!exists && current) {
      const samePathOtherMode = summary.status.changedFiles.find(
        (file) =>
          file.path === current.path &&
          (current.mode === "+" ? file.unstaged : file.staged),
      );
      if (samePathOtherMode) {
        const moved: DiffSelection = {
          path: samePathOtherMode.path,
          mode: current.mode === "+" ? "-" : "+",
        };
        setSelected(moved);
        setSelectionTransition("moved-group");
      } else {
        setSelected(null);
        setSelectionTransition("reset");
      }
    } else {
      setSelectionTransition("none");
    }
  }, [
    isOpen,
    summary.hasRepo,
    summary.isLoading,
    summary.localError,
    summary.repo,
    summary.status,
    dismissFeedback,
  ]);

  useEffect(() => {
    if (panelState === "ready") {
      void loadRemotes();
      void loadWorktreeStatus();
    }
  }, [panelState, loadRemotes, loadWorktreeStatus]);

  const selectEntry = useCallback(
    async (entry: SourceControlEntry) => {
      if (!repo) return;
      const nextSelection: DiffSelection = { path: entry.path, mode: entry.mode };
      if (sameSelection(selected, nextSelection)) {
        setActionError(null);
        setActionMessage(null);
        setSelectionTransition("none");
        return;
      }
      setSelected(nextSelection);
      setActionError(null);
      setActionMessage(null);
      setSelectionTransition("none");
      const file = status?.changedFiles.find((c) => c.path === entry.path);
      openSelection(nextSelection, repo.repoRoot, file);
    },
    [openSelection, repo, selected, status],
  );

  const runMutation = useCallback(
    async (
      busyKey: string,
      optimistic: ((status: GitStatusSnapshot) => GitStatusSnapshot) | null,
      ipc: () => Promise<void>,
      affected: string[],
    ) => {
      if (!repo || summary.busyAction) return;
      setLocalActionBusy(busyKey);
      setActionMessage(null);
      setActionError(null);
      if (optimistic) summary.applyStatus(optimistic);
      for (const path of affected) {
        invalidateDiff(workingDiffKey(repo.repoRoot, path, "+"));
        invalidateDiff(workingDiffKey(repo.repoRoot, path, "-"));
      }
      try {
        await ipc();
        scheduleReconcile();
      } catch (error) {
        setActionError(normalizeError(error));
        cancelReconcile();
        await summary.refresh({ remote: "never" }).catch(() => {});
      } finally {
        setLocalActionBusy(null);
      }
    },
    [cancelReconcile, repo, scheduleReconcile, summary],
  );

  const stageEntry = useCallback(
    async (entry: SourceControlEntry) => {
      if (!repo) return;
      const paths = new Set([entry.path]);
      await runMutation(
        `stage:${entry.path}`,
        (s) => optimisticStage(s, paths),
        () => native.gitStage(repo.repoRoot, [entry.path]),
        [entry.path],
      );
    },
    [repo, runMutation],
  );

  const unstageEntry = useCallback(
    async (entry: SourceControlEntry) => {
      if (!repo) return;
      const paths = new Set([entry.path]);
      await runMutation(
        `unstage:${entry.path}`,
        (s) => optimisticUnstage(s, paths),
        () => native.gitUnstage(repo.repoRoot, [entry.path]),
        [entry.path],
      );
    },
    [repo, runMutation],
  );

  const executeDiscard = useCallback(
    async (list: SourceControlEntry[], key: string) => {
      if (!repo) return;
      const entries: GitDiscardEntry[] = list.map((entry) => ({
        path: entry.path,
        untracked: entry.untracked,
      }));
      const paths = new Set(list.map((entry) => entry.path));
      await runMutation(
        key,
        (s) => optimisticDiscard(s, paths),
        () => native.gitDiscard(repo.repoRoot, entries),
        [...paths],
      );
    },
    [repo, runMutation],
  );

  const requestDiscardEntry = useCallback(
    (entry: SourceControlEntry) => {
      if (!repo || summary.busyAction) return;
      // D = tracked deleted file; git restore brings it back with no data loss
      if (entry.statusCode === "D") {
        void executeDiscard([entry], `discard:${entry.path}`);
        return;
      }
      setPendingDiscard({ scope: "single", entry });
    },
    [repo, summary.busyAction, executeDiscard],
  );

  const requestDiscardAll = useCallback(() => {
    if (!repo || summary.busyAction || unstagedEntries.length === 0) return;
    setPendingDiscard({ scope: "all", entries: unstagedEntries });
  }, [repo, summary.busyAction, unstagedEntries]);

  const cancelPendingDiscard = useCallback(() => {
    setPendingDiscard(null);
  }, []);

  const confirmPendingDiscard = useCallback(async () => {
    if (!pendingDiscard) return;
    const list =
      pendingDiscard.scope === "single"
        ? [pendingDiscard.entry]
        : pendingDiscard.entries;
    const key =
      pendingDiscard.scope === "single"
        ? `discard:${list[0].path}`
        : "discard:all";
    setPendingDiscard(null);
    await executeDiscard(list, key);
  }, [pendingDiscard, executeDiscard]);

  const stageAllEntries = useCallback(async () => {
    if (!repo || unstagedEntries.length === 0) return;
    const paths = new Set(unstagedEntries.map((entry) => entry.path));
    await runMutation(
      "stage:all",
      (s) => optimisticStage(s, paths),
      () => native.gitStage(repo.repoRoot, [...paths]),
      [...paths],
    );
  }, [repo, runMutation, unstagedEntries]);

  const unstageAllEntries = useCallback(async () => {
    if (!repo || stagedEntries.length === 0) return;
    const paths = new Set(stagedEntries.map((entry) => entry.path));
    await runMutation(
      "unstage:all",
      (s) => optimisticUnstage(s, paths),
      () => native.gitUnstage(repo.repoRoot, [...paths]),
      [...paths],
    );
  }, [repo, runMutation, stagedEntries]);

  const stageEntries = useCallback(
    async (entries: SourceControlEntry[]) => {
      if (!repo || entries.length === 0) return;
      const paths = new Set(entries.map((entry) => entry.path));
      await runMutation(
        "stage:folder",
        (s) => optimisticStage(s, paths),
        () => native.gitStage(repo.repoRoot, [...paths]),
        [...paths],
      );
    },
    [repo, runMutation],
  );

  const unstageEntries = useCallback(
    async (entries: SourceControlEntry[]) => {
      if (!repo || entries.length === 0) return;
      const paths = new Set(entries.map((entry) => entry.path));
      await runMutation(
        "unstage:folder",
        (s) => optimisticUnstage(s, paths),
        () => native.gitUnstage(repo.repoRoot, [...paths]),
        [...paths],
      );
    },
    [repo, runMutation],
  );

  const requestDiscardEntries = useCallback(
    (entries: SourceControlEntry[]) => {
      if (!repo || summary.busyAction || entries.length === 0) return;
      setPendingDiscard({ scope: "all", entries });
    },
    [repo, summary.busyAction],
  );

  const commit = useCallback(async () => {
    if (!repo || summary.busyAction) return;
    setLocalActionBusy("commit");
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await native.gitCommit(repo.repoRoot, commitMessage);
      setCommitMessage("");
      flushCommitMessage();
      setActionMessage(
        `Committed ${result.commitSha.slice(0, 7)} ${result.summary}`,
      );
      invalidateRepoDiffs(repo.repoRoot);
      await summary.refresh({ remote: "never" });
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setLocalActionBusy(null);
    }
  }, [commitMessage, repo, summary, setCommitMessage, flushCommitMessage]);

  const push = useCallback(async () => {
    if (!repo) return;
    setActionMessage(null);
    setActionError(null);
    const result = await summary.runRemoteAction("push");
    if (result.ok) {
      setActionMessage(
        status?.upstream ? `Pushed to ${status.upstream}` : "Push completed",
      );
      return;
    }
    if (result.error) {
      setActionError(result.error);
    }
  }, [repo, status?.upstream, summary]);

  const commitAndPush = useCallback(async () => {
    if (!repo || summary.busyAction) return;
    setLocalActionBusy("commit");
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await native.gitCommit(repo.repoRoot, commitMessage);
      setCommitMessage("");
      flushCommitMessage();
      invalidateRepoDiffs(repo.repoRoot);
      await summary.refresh({ remote: "never" });
      setLocalActionBusy(null);
      const pushResult = await summary.runRemoteAction("push");
      if (pushResult.ok) {
        setActionMessage(
          `Committed ${result.commitSha.slice(0, 7)} ${result.summary} and pushed`,
        );
      } else if (pushResult.error) {
        setActionError(pushResult.error);
      }
    } catch (error) {
      setActionError(normalizeError(error));
      setLocalActionBusy(null);
    }
  }, [commitMessage, repo, summary, setCommitMessage, flushCommitMessage]);

  const pendingDiscardView = useMemo<PendingDiscard | null>(() => {
    if (!pendingDiscard) return null;
    if (pendingDiscard.scope === "single") {
      return {
        scope: "single",
        count: 1,
        label: pendingDiscard.entry.path,
        untracked: pendingDiscard.entry.untracked,
      };
    }
    const untrackedCount = pendingDiscard.entries.filter((e) => e.untracked).length;
    return {
      scope: "all",
      count: pendingDiscard.entries.length,
      label: `${pendingDiscard.entries.length} unstaged ${
        pendingDiscard.entries.length === 1 ? "file" : "files"
      }`,
      untrackedCount,
    };
  }, [pendingDiscard]);

  return {
    panelState,
    repo,
    status,
    selected,
    commitMessage,
    actionBusy: localActionBusy ?? summary.busyAction,
    statusError: summary.localError,
    actionError,
    remoteError: summary.lastRemoteError,
    actionMessage,
    dismissFeedback,
    stagedEntries,
    unstagedEntries,
    allClean,
    canPush,
    pushHint,
    selectionTransition,
    pendingDiscard: pendingDiscardView,
    remotes,
    remotesLoading,
    selectedRemote,
    setSelectedRemote,
    fetchBranches,
    fetchWorktrees,
    checkout,
    createBranch,
    addRemote,
    worktreeName: worktreeStatus.worktreeName,
    worktreeCount: worktreeStatus.worktreeCount,
    setCommitMessage,
    refresh,
    selectEntry,
    stageEntry,
    unstageEntry,
    requestDiscardEntry,
    requestDiscardAll,
    confirmPendingDiscard,
    cancelPendingDiscard,
    stageAllEntries,
    unstageAllEntries,
    stageEntries,
    unstageEntries,
    requestDiscardEntries,
    commit,
    push,
    commitAndPush,
  };
}
