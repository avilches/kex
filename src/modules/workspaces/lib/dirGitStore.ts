import { useEffect, useSyncExternalStore } from "react";
import { native } from "@/lib/native";
import { subscribeToCommandFinished } from "./terminalEphemeralStore";

export type DirGit = { branch: string; repoRoot: string };

type Listener = () => void;

const NONE: DirGit = { branch: "", repoRoot: "" };
const COMMAND_REFRESH_DELAY_MS = 400;

// The branch of each folder anyone asked about. Titles only read it; it changes, and
// notifies, when a query finds a different branch.
const cache = new Map<string, DirGit>();
// How many titles show git for a folder, and the same per tab (owner), so a finished
// command can refresh just the folders of its own tab.
const demand = new Map<string, number>();
const owners = new Map<string, Map<string, number>>();
const inFlight = new Set<string>();
const listeners = new Set<Listener>();
let detach: (() => void) | null = null;

function notify(): void {
  for (const l of listeners) l();
}

// Folders of one repository share its branch, so a checkout seen from one is known to
// all of them without asking git again.
function shareWithRepo(from: string, git: DirGit): void {
  if (!git.repoRoot) return;
  for (const [dir, other] of cache) {
    if (dir !== from && other.repoRoot === git.repoRoot && other.branch !== git.branch) {
      cache.set(dir, { branch: git.branch, repoRoot: other.repoRoot });
    }
  }
}

async function refreshDir(dir: string): Promise<void> {
  if (inFlight.has(dir)) return;
  inFlight.add(dir);
  try {
    const info = await native.gitResolveRepo(dir).catch(() => null);
    const next: DirGit = info
      ? { branch: info.isDetached ? "" : info.branch, repoRoot: info.repoRoot }
      : NONE;
    const prev = cache.get(dir);
    if (!prev || prev.branch !== next.branch || prev.repoRoot !== next.repoRoot) {
      cache.set(dir, next);
      shareWithRepo(dir, next);
      notify();
    }
  } finally {
    inFlight.delete(dir);
  }
}

export function refreshDemandedDirs(): void {
  for (const dir of demand.keys()) void refreshDir(dir);
}

export function refreshDirsOf(tabIds: Iterable<string>): void {
  const dirs = new Set<string>();
  for (const id of tabIds) for (const dir of owners.get(id)?.keys() ?? []) dirs.add(dir);
  for (const dir of dirs) void refreshDir(dir);
}

// A checkout does not change the cwd, so the moment a command ends in a terminal is when
// its branch can have changed: only that tab's folders are asked then. Focus covers
// changes made from outside Kex, and asks every demanded folder.
function attach(): void {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const offFinished = subscribeToCommandFinished((tabId) => {
    if (!owners.has(tabId)) return;
    pending.add(tabId);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const ids = [...pending];
      pending.clear();
      refreshDirsOf(ids);
    }, COMMAND_REFRESH_DELAY_MS);
  });
  window.addEventListener("focus", refreshDemandedDirs);
  detach = () => {
    clearTimeout(timer);
    offFinished();
    window.removeEventListener("focus", refreshDemandedDirs);
  };
}

function addOwner(owner: string, dir: string): void {
  const dirs = owners.get(owner) ?? new Map<string, number>();
  dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
  owners.set(owner, dirs);
}

function removeOwner(owner: string, dir: string): void {
  const dirs = owners.get(owner);
  if (!dirs) return;
  const left = (dirs.get(dir) ?? 1) - 1;
  if (left > 0) dirs.set(dir, left);
  else dirs.delete(dir);
  if (dirs.size === 0) owners.delete(owner);
}

// `owner` is the tab whose commands can change this folder's branch (its own id).
export function demandDir(dir: string, owner?: string): () => void {
  const count = demand.get(dir) ?? 0;
  demand.set(dir, count + 1);
  if (owner) addOwner(owner, dir);
  if (count === 0) {
    if (!detach) attach();
    void refreshDir(dir);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (owner) removeOwner(owner, dir);
    const left = (demand.get(dir) ?? 1) - 1;
    if (left > 0) {
      demand.set(dir, left);
      return;
    }
    demand.delete(dir);
    if (demand.size === 0 && detach) {
      detach();
      detach = null;
    }
  };
}

export function subscribeDirGit(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getDirGit(dir: string | undefined): DirGit {
  return (dir && cache.get(dir)) || NONE;
}

// Only asks git while mounted with a directory; `dir` undefined costs nothing.
export function useDirGit(dir: string | undefined, owner?: string): DirGit {
  useEffect(() => (dir ? demandDir(dir, owner) : undefined), [dir, owner]);
  return useSyncExternalStore(subscribeDirGit, () => getDirGit(dir));
}

export function _resetDirGitStore(): void {
  detach?.();
  detach = null;
  cache.clear();
  demand.clear();
  owners.clear();
  inFlight.clear();
  listeners.clear();
}
