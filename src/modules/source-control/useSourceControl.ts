import { normalizeError } from "@/lib/errors";
import {
  native,
  type GitRepoInfo,
  type GitStatusSnapshot,
} from "@/lib/native";
import { listenFsChanged } from "@/modules/explorer/lib/watch";
import { useWorkspaceEnvStore, workspaceScopeKey } from "@/modules/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canReuseResolvedRepo, isContextSwitching } from "./repoReuse";
import {
  mergeRefreshMode,
  shouldUpgradeInflightRefresh,
  type SourceControlRefreshMode,
} from "./refreshMode";

const AUTO_FETCH_THROTTLE_MS = 5 * 60_000;
const AUTO_FETCH_LRU_LIMIT = 16;
const FOCUS_REFRESH_MIN_INTERVAL_MS = 1500;
// Skip the context-change refetch when the data is this fresh and the context
// path is unchanged (a re-fired effect, not a navigation to a different folder).
const SC_STATUS_TTL_MS = 2000;

export type { SourceControlRefreshMode } from "./refreshMode";
type SourceControlRemoteAction = "fetch" | "pull" | "push";
type SourceControlRemoteActionMode =
  | "contextual"
  | SourceControlRemoteAction;

type SourceControlRemoteActionResult = {
  ok: boolean;
  action: SourceControlRemoteAction | null;
  error?: string;
  blocked?: "diverged" | "missing-upstream" | "no-repo";
};

export type SourceControlSummary = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  changedCount: number;
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRepo: boolean;
  isLoading: boolean;
  // True from the moment the context path changes until the repo/status for
  // it resolve, even before a refetch starts. Consumers must not let the user
  // act on `repo`/`status` while this is true: they still hold the outgoing
  // context's data.
  isSwitchingContext: boolean;
  localError: string | null;
  busyAction: SourceControlRemoteAction | null;
  lastRemoteError: string | null;
  applyStatus: (
    updater: (status: GitStatusSnapshot) => GitStatusSnapshot,
  ) => void;
  refresh: (options?: {
    remote?: SourceControlRefreshMode;
  }) => Promise<void>;
  runRemoteAction: (
    mode?: SourceControlRemoteActionMode,
    options?: { remote?: string },
  ) => Promise<SourceControlRemoteActionResult>;
  clearRemoteError: () => void;
};

type SourceControlRemoteIndicator = {
  visible: boolean;
  label: string;
  title: string;
  disabled: boolean;
  action: SourceControlRemoteAction | null;
};

type SourceControlSummaryState = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  hasRepo: boolean;
  isLoading: boolean;
  localError: string | null;
  busyAction: SourceControlRemoteAction | null;
  lastRemoteError: string | null;
};

function getContextualAction(
  status: GitStatusSnapshot | null,
): SourceControlRemoteAction | null {
  if (!status?.upstream) return null;
  if (status.ahead > 0 && status.behind > 0) return null;
  if (status.behind > 0) return "pull";
  if (status.ahead > 0) return "push";
  return "fetch";
}

export function getSourceControlRemoteIndicator(
  summary: Pick<
    SourceControlSummary,
    "hasRepo" | "upstream" | "ahead" | "behind" | "busyAction"
  >,
): SourceControlRemoteIndicator {
  if (!summary.hasRepo || !summary.upstream) {
    return { visible: false, label: "", title: "", disabled: true, action: null };
  }
  if (summary.ahead > 0 && summary.behind > 0) {
    return {
      visible: true,
      label: `↑${summary.ahead} ↓${summary.behind}`,
      title:
        "Branch has diverged from upstream. Use Source Control or the terminal to resolve it.",
      disabled: true,
      action: null,
    };
  }
  if (summary.behind > 0) {
    return {
      visible: true,
      label: `↓${summary.behind}`,
      title: `Pull ${summary.behind} remote ${
        summary.behind === 1 ? "commit" : "commits"
      } with fast-forward only.`,
      disabled: summary.busyAction !== null,
      action: "pull",
    };
  }
  if (summary.ahead > 0) {
    return {
      visible: true,
      label: `↑${summary.ahead}`,
      title: `Push ${summary.ahead} local ${
        summary.ahead === 1 ? "commit" : "commits"
      }.`,
      disabled: summary.busyAction !== null,
      action: "push",
    };
  }
  return {
    visible: true,
    label: "Sync",
    title: "Fetch remote updates.",
    disabled: summary.busyAction !== null,
    action: "fetch",
  };
}

function touchAutoFetch(map: Map<string, number>, key: string): void {
  map.delete(key);
  map.set(key, Date.now());
  while (map.size > AUTO_FETCH_LRU_LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function useSourceControl(
  contextPath: string | null,
  enabled: boolean = true,
): SourceControlSummary {
  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const workspaceKey = workspaceScopeKey(workspaceEnv);
  const [state, setState] = useState<SourceControlSummaryState>({
    repo: null,
    status: null,
    hasRepo: false,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
  });
  const stateRef = useRef(state);
  const requestIdRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const inflightModeRef = useRef<SourceControlRefreshMode>("never");
  // A refresh mode queued while another run is in flight and not aggressive
  // enough to justify a second concurrent run; drained by the in-flight run
  // itself right before it clears inflightRef. See refresh() below.
  const pendingModeRef = useRef<SourceControlRefreshMode | null>(null);
  const autoFetchByRepoRef = useRef(new Map<string, number>());
  const enabledRef = useRef(enabled);
  const lastRefreshAtRef = useRef(0);
  // The context path the current repo was resolved from. Reuse is keyed on this
  // exact path, never on a prefix, so a nested repo/worktree re-resolves.
  const resolvedContextRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    requestIdRef.current++;
    inflightRef.current = null;
    inflightModeRef.current = "never";
    autoFetchByRepoRef.current.clear();
    resolvedContextRef.current = null;
    setState({
      repo: null,
      status: null,
      hasRepo: false,
      isLoading: false,
      localError: null,
      busyAction: null,
      lastRemoteError: null,
    });
  }, [workspaceKey]);

  const applyStatus = useCallback(
    (updater: (status: GitStatusSnapshot) => GitStatusSnapshot) => {
      setState((current) => {
        if (!current.status) return current;
        const next = updater(current.status);
        if (next === current.status) return current;
        return { ...current, status: next };
      });
    },
    [],
  );

  const doRefresh = useCallback(
    async (remoteMode: SourceControlRefreshMode): Promise<void> => {
      if (!enabledRef.current) return;
      const requestId = ++requestIdRef.current;

      if (!contextPath) {
        resolvedContextRef.current = null;
        setState({
          repo: null,
          status: null,
          hasRepo: false,
          isLoading: false,
          localError: null,
          busyAction: null,
          lastRemoteError: null,
        });
        return;
      }

      const activeRoot = stateRef.current.repo?.repoRoot ?? null;
      const reusableRoot =
        activeRoot && canReuseResolvedRepo(contextPath, resolvedContextRef.current)
          ? activeRoot
          : undefined;

      setState((current) => ({ ...current, isLoading: true, localError: null }));

      try {
        let repo: GitRepoInfo | null;
        let status: GitStatusSnapshot | null;

        if (reusableRoot) {
          try {
            repo = stateRef.current.repo ?? null;
            status = await native.gitStatus(reusableRoot);
            if (requestId !== requestIdRef.current) return;
            if (!repo || repo.repoRoot !== reusableRoot) {
              repo = {
                repoRoot: reusableRoot,
                branch: status.branch,
                upstream: status.upstream,
                isDetached: status.isDetached,
                isWorktree: repo?.isWorktree ?? false,
              };
            }
          } catch {
            const snapshot = await native.gitSidebarSnapshot(contextPath);
            if (requestId !== requestIdRef.current) return;
            if (!snapshot.repo) {
              setState((current) => ({
                ...current,
                repo: null,
                status: null,
                hasRepo: false,
                isLoading: false,
                localError: null,
              }));
              return;
            }
            repo = snapshot.repo;
            status = snapshot.status ?? null;
          }
        } else {
          const snapshot = await native.gitSidebarSnapshot(contextPath);
          if (requestId !== requestIdRef.current) return;
          if (!snapshot.repo) {
            setState((current) => ({
              ...current,
              repo: null,
              status: null,
              hasRepo: false,
              isLoading: false,
              localError: null,
            }));
            return;
          }
          repo = snapshot.repo;
          status = snapshot.status ?? null;
        }

        if (!repo) {
          setState((current) => ({
            ...current,
            repo: null,
            status: null,
            hasRepo: false,
            isLoading: false,
            localError: null,
          }));
          return;
        }

        let nextRemoteError = stateRef.current.lastRemoteError;
        const shouldAutoFetch =
          repo.upstream &&
          remoteMode !== "never" &&
          (remoteMode === "always" ||
            Date.now() -
              (autoFetchByRepoRef.current.get(repo.repoRoot) ?? 0) >=
              AUTO_FETCH_THROTTLE_MS);

        if (shouldAutoFetch) {
          try {
            await native.gitFetch(repo.repoRoot);
            touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
            nextRemoteError = null;
            if (requestId !== requestIdRef.current) return;
            status = await native.gitStatus(repo.repoRoot);
            if (requestId !== requestIdRef.current) return;
          } catch (error) {
            nextRemoteError = normalizeError(error, "Unknown source control error");
          }
        }

        resolvedContextRef.current = contextPath;
        setState((current) => ({
          ...current,
          repo,
          status,
          hasRepo: true,
          isLoading: false,
          localError: null,
          lastRemoteError: nextRemoteError,
        }));
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        resolvedContextRef.current = null;
        setState((current) => ({
          ...current,
          repo: null,
          hasRepo: false,
          status: null,
          isLoading: false,
          localError: normalizeError(error, "Unknown source control error"),
        }));
      } finally {
        lastRefreshAtRef.current = Date.now();
      }
    },
    [contextPath, workspaceKey],
  );

  // Always the latest doRefresh, read by the trailing-rerun drain loop below
  // so a run queued against an older contextPath/workspaceKey still executes
  // with the current one once it actually fires. Plain assignment during
  // render, not an effect: doRefresh only closes over refs plus contextPath/
  // workspaceKey, so keeping this in sync a render early (before any effect
  // runs) is safe and matches the "latest ref" pattern already used elsewhere
  // in this codebase (e.g. RichMarkdownEditor.tsx).
  const doRefreshRef = useRef(doRefresh);
  doRefreshRef.current = doRefresh;

  const refresh = useCallback(
    (options?: { remote?: SourceControlRefreshMode }): Promise<void> => {
      const remoteMode = options?.remote ?? "never";

      const startRun = (mode: SourceControlRefreshMode): Promise<void> => {
        inflightModeRef.current = mode;
        // Definite-assignment assertion: `run` is assigned the instant the
        // IIFE call below returns its pending promise, before the async body
        // resumes past its first `await` and reaches the `run` reference.
        let run!: Promise<void>;
        run = (async () => {
          try {
            await doRefreshRef.current(mode);
            // Drain any request(s) that queued while this run (or a chain of
            // trailing runs before it) was executing, so none of them is
            // silently dropped: a contextPath switch that lands mid-flight
            // still resolves, and a post stage/unstage reconcile still gets a
            // status read that postdates the mutation.
            while (pendingModeRef.current !== null) {
              const nextMode = pendingModeRef.current;
              pendingModeRef.current = null;
              inflightModeRef.current = nextMode;
              await doRefreshRef.current(nextMode);
            }
          } finally {
            // Cleanup lives inside the async body (not chained as a `.finally()`
            // on the returned promise) so it runs in the same synchronous
            // continuation as the while loop's exit check, with no microtask
            // gap in between where another refresh() could observe a stale
            // inflightRef and queue its request into a pendingModeRef nobody
            // will drain again.
            if (inflightRef.current === run) {
              inflightRef.current = null;
              inflightModeRef.current = "never";
            }
          }
        })();
        inflightRef.current = run;
        return run;
      };

      const inflight = inflightRef.current;
      if (inflight) {
        if (shouldUpgradeInflightRefresh(inflightModeRef.current, remoteMode)) {
          return startRun(remoteMode);
        }
        // A run is already in flight and this request isn't aggressive enough
        // to justify a second concurrent one. Queue it as a trailing rerun
        // instead of returning the stale in-flight promise and dropping it.
        pendingModeRef.current = mergeRefreshMode(pendingModeRef.current, remoteMode);
        return inflight;
      }

      return startRun(remoteMode);
    },
    [],
  );

  const runRemoteAction = useCallback(
    async (
      mode: SourceControlRemoteActionMode = "contextual",
      options?: { remote?: string },
    ): Promise<SourceControlRemoteActionResult> => {
      const { repo, status } = stateRef.current;
      if (!repo || !status) {
        return { ok: false, action: null, blocked: "no-repo" };
      }
      if (!status.upstream) {
        return { ok: false, action: null, blocked: "missing-upstream" };
      }

      const action = mode === "contextual" ? getContextualAction(status) : mode;
      if (!action) {
        return { ok: false, action: null, blocked: "diverged" };
      }

      setState((current) => ({ ...current, busyAction: action }));

      try {
        if (action === "fetch") {
          if (options?.remote) {
            await native.gitFetchRemote(repo.repoRoot, options.remote);
          } else {
            await native.gitFetch(repo.repoRoot);
          }
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
        } else if (action === "pull") {
          await native.gitFetch(repo.repoRoot);
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
          await native.gitPullFfOnly(repo.repoRoot);
        } else {
          await native.gitPush(repo.repoRoot);
        }
        setState((current) => ({ ...current, lastRemoteError: null }));
        await refresh({ remote: "never" });
        return { ok: true, action };
      } catch (error) {
        const message = normalizeError(error, "Unknown source control error");
        setState((current) => ({ ...current, lastRemoteError: message }));
        await refresh({ remote: "never" }).catch(() => {});
        return { ok: false, action, error: message };
      } finally {
        setState((current) => ({ ...current, busyAction: null }));
      }
    },
    [refresh],
  );

  const clearRemoteError = useCallback(() => {
    setState((current) =>
      current.lastRemoteError === null
        ? current
        : { ...current, lastRemoteError: null },
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current++;
      setState({
        repo: null,
        status: null,
        hasRepo: false,
        isLoading: false,
        localError: null,
        busyAction: null,
        lastRemoteError: null,
      });
      return;
    }
    setState((current) => ({ ...current, lastRemoteError: null }));
    const run = () => {
      const sameContext = canReuseResolvedRepo(
        contextPath,
        resolvedContextRef.current,
      );
      const fresh = Date.now() - lastRefreshAtRef.current < SC_STATUS_TTL_MS;
      if (fresh && sameContext && stateRef.current.hasRepo) return;
      void refresh({ remote: "never" });
    };
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(run, { timeout: 600 })
        : (window.setTimeout(run, 0) as unknown as number);
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        try {
          window.cancelIdleCallback(idle as number);
        } catch {
          /* noop */
        }
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, [refresh, contextPath, enabled, workspaceKey]);

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        const elapsed = Date.now() - lastRefreshAtRef.current;
        if (elapsed < FOCUS_REFRESH_MIN_INTERVAL_MS) return;
        void refresh({ remote: "never" });
      }, 400);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearTimeout(timer);
    };
  }, [refresh, enabled]);

  // Working-tree edits (editor saves, file create/delete, terminal git ops in
  // watched dirs) only reach the explorer tree. The status snapshot that drives
  // both the panel and the explorer colors is otherwise refreshed only on
  // context change / focus, so subscribe to the same debounced watcher signal
  // and re-pull on a trailing edge.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    let timer = 0;
    void listenFsChanged(() => {
      if (!enabledRef.current) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        void refresh({ remote: "never" });
      }, 250);
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      unlisten?.();
    };
  }, [refresh, enabled]);

  return useMemo<SourceControlSummary>(
    () => ({
      repo: state.repo,
      status: state.status,
      changedCount: state.status?.changedFiles.length ?? 0,
      upstream: state.status?.upstream ?? state.repo?.upstream ?? null,
      ahead: state.status?.ahead ?? 0,
      behind: state.status?.behind ?? 0,
      hasRepo: state.hasRepo,
      isLoading: state.isLoading,
      isSwitchingContext: isContextSwitching(
        state.hasRepo,
        contextPath,
        resolvedContextRef.current,
      ),
      localError: state.localError,
      busyAction: state.busyAction,
      lastRemoteError: state.lastRemoteError,
      applyStatus,
      refresh,
      runRemoteAction,
      clearRemoteError,
    }),
    [state, contextPath, applyStatus, refresh, runRemoteAction, clearRemoteError],
  );
}
