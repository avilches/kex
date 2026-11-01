import { native } from "@/lib/native";
import { useEffect } from "react";

function send(open: boolean): void {
  native.setOnboardingOpen(open).catch((e) => console.error("[kex] onboarding block failed:", e));
}

// Rust refuses a new window while any window has its onboarding open. Every way the dialog goes
// away (closing, unmounting) releases it, and a fresh mount releases what a reload of this
// webview may have left behind; a window that is destroyed is released by Rust itself.
export function useOnboardingBlock(open: boolean): void {
  useEffect(() => send(false), []);
  useEffect(() => {
    if (!open) return;
    send(true);
    return () => send(false);
  }, [open]);
}
