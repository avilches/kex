import { native } from "@/lib/native";
import { create } from "zustand";
import { restart } from "./lib/onboardingState";
import { persistOnboarding } from "./lib/persistOnboarding";

export const ONBOARDING_RESTART_EVENT = "kex:onboarding-restart";

type OnboardingUi = { open: boolean };

export const useOnboardingUi = create<OnboardingUi>(() => ({ open: false }));

// Only one window at a time may show the dialog: Rust grants the block to the first window that
// asks and, when another already holds it, brings that one to the front instead. If the call
// itself fails the dialog opens anyway, so the setup is never unreachable.
export async function openOnboarding(): Promise<void> {
  const granted = await native.setOnboardingOpen(true).catch((e) => {
    console.error("[kex] onboarding block failed:", e);
    return true;
  });
  if (granted) useOnboardingUi.setState({ open: true });
}

export function closeOnboarding(): void {
  useOnboardingUi.setState({ open: false });
}

// A live read for the shortcut and menu gates, which run outside React.
export function isOnboardingOpen(): boolean {
  return useOnboardingUi.getState().open;
}

// Settings is its own webview and the dialog lives in the main windows; Rust passes the request
// to the one main window used last, so a single dialog opens.
export function requestOnboardingRestart(): void {
  persistOnboarding(restart);
  native
    .requestOnboardingRestart()
    .catch((e) => console.error("[kex] onboarding restart request failed:", e));
}
