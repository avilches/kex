import { type DependencyList, useEffect } from "react";
import { listen, type EventCallback, type EventName, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Subscribes to a Tauri event for the lifetime of the calling component.
 *
 * listen() is async: its promise can resolve after the component has already
 * unmounted. Without an "alive" guard, the returned unlisten() either never
 * runs (a leaked listener that keeps firing the handler) or the handler
 * itself runs once more against a dead component. This hook tears the
 * listener down immediately if that race happens, and otherwise unlistens
 * normally on unmount.
 */
export function useTauriListen<T>(
  event: EventName,
  handler: EventCallback<T>,
  deps: DependencyList = [],
): void {
  useEffect(() => {
    let alive = true;
    let unlisten: UnlistenFn | undefined;
    listen<T>(event, handler)
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch((err) => console.error(`[useTauriListen] listen failed for ${event}:`, err));
    return () => {
      alive = false;
      unlisten?.();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps is the caller-supplied dependency list
  }, deps);
}

/**
 * Same alive-guarded teardown as useTauriListen, for call sites that already
 * have their own async unlisten factory (one that wraps or aggregates one or
 * more listen() calls, e.g. onPreferencesChange) instead of a raw event name.
 */
export function useTauriUnlisten(
  factory: () => Promise<UnlistenFn>,
  deps: DependencyList = [],
): void {
  useEffect(() => {
    let alive = true;
    let unlisten: UnlistenFn | undefined;
    factory()
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch((err) => console.error("[useTauriUnlisten] listen failed:", err));
    return () => {
      alive = false;
      unlisten?.();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps is the caller-supplied dependency list
  }, deps);
}
