import { native } from "@/lib/native";
import { useEffect } from "react";

function release(): void {
  native.setOnboardingOpen(false).catch((e) => console.error("[kex] onboarding release failed:", e));
}

// `openOnboarding` takes the block in Rust before the dialog shows; every way the dialog goes
// away (closing, unmounting) releases it, and a fresh mount releases what a reload of this
// webview may have left behind. Rust ignores a release from a window that does not hold it, and
// releases a destroyed window by itself.
export function useOnboardingBlock(open: boolean): void {
  useEffect(release, []);
  useEffect(() => {
    if (!open) return;
    return release;
  }, [open]);
}
