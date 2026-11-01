import { native } from "@/lib/native";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useState } from "react";
import { type BlockPayload, busyForOthers } from "./onboardingBusy";

export const ONBOARDING_BLOCK_EVENT = "kex:onboarding-block";

// True while another window has its onboarding dialog open. The event only reports changes, so a
// window that opens or reloads in the middle of one asks Rust once; an event that lands while
// that answer is on its way is newer than it and wins.
export function useOnboardingBusy(): boolean {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const own = getCurrentWebviewWindow().label;
    let alive = true;
    let heard = false;
    let unlisten: (() => void) | undefined;

    listen<BlockPayload>(ONBOARDING_BLOCK_EVENT, (e) => {
      heard = true;
      setBusy(busyForOthers(e.payload.holder, own));
    })
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      })
      .catch((e) => console.error("[kex] onboarding block listen failed:", e));

    native
      .onboardingBlockHolder()
      .then((p) => {
        if (alive && !heard) setBusy(busyForOthers(p.holder, own));
      })
      .catch((e) => console.error("[kex] onboarding block holder failed:", e));

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return busy;
}
