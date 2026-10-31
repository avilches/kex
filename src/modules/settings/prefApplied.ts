import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PrefKey } from "./store";

const PREF_APPLIED_EVENT = "kex://pref-applied";

type PrefAppliedPayload = { key: PrefKey };

export function announcePrefApplied(key: PrefKey): void {
  void emit(PREF_APPLIED_EVENT, { key } satisfies PrefAppliedPayload).catch(
    () => {},
  );
}

export function onPrefApplied(
  cb: (key: PrefKey) => void,
): Promise<UnlistenFn> {
  return listen<PrefAppliedPayload>(PREF_APPLIED_EVENT, (e) =>
    cb(e.payload.key),
  );
}
