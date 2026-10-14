import { useEffect, useSyncExternalStore } from "react";
import { native } from "@/lib/native";
import { subscribeToRunningCommands } from "./terminalEphemeralStore";

export type DirGit = { branch: string; repoRoot: string };

type Listener = () => void;

const NONE: DirGit = { branch: "", repoRoot: "" };
const COMMAND_REFRESH_DELAY_MS = 400;

const cache = new Map<string, DirGit>();
const demand = new Map<string, number>();
const inFlight = new Set<string>();
const listeners = new Set<Listener>();
let detach: (() => void) | null = null;

function notify(): void {
  for (const l of listeners) l();
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
      notify();
    }
  } finally {
    inFlight.delete(dir);
  }
}

export function refreshDemandedDirs(): void {
  for (const dir of demand.keys()) void refreshDir(dir);
}

// A git checkout does not change the cwd, so the moment a command finishes in any
// terminal is when a branch can have changed; focus covers changes made elsewhere.
function attach(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refreshDemandedDirs, COMMAND_REFRESH_DELAY_MS);
  };
  const offCommands = subscribeToRunningCommands(schedule);
  window.addEventListener("focus", refreshDemandedDirs);
  detach = () => {
    clearTimeout(timer);
    offCommands();
    window.removeEventListener("focus", refreshDemandedDirs);
  };
}

export function demandDir(dir: string): () => void {
  const count = demand.get(dir) ?? 0;
  demand.set(dir, count + 1);
  if (count === 0) {
    if (!detach) attach();
    void refreshDir(dir);
  }
  return () => {
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

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getDirGit(dir: string | undefined): DirGit {
  return (dir && cache.get(dir)) || NONE;
}

// Only queries git while mounted with a directory; `dir` undefined costs nothing.
export function useDirGit(dir: string | undefined): DirGit {
  useEffect(() => (dir ? demandDir(dir) : undefined), [dir]);
  return useSyncExternalStore(subscribe, () => getDirGit(dir));
}

export function _resetDirGitStore(): void {
  detach?.();
  detach = null;
  cache.clear();
  demand.clear();
  inFlight.clear();
  listeners.clear();
}
