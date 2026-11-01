import { emit } from "@tauri-apps/api/event";
import { create } from "zustand";
import { restart } from "./lib/onboardingState";
import { persistOnboarding } from "./lib/persistOnboarding";

export const ONBOARDING_RESTART_EVENT = "kex:onboarding-restart";

type OnboardingUi = { open: boolean };

export const useOnboardingUi = create<OnboardingUi>(() => ({ open: false }));

export function openOnboarding(): void {
  useOnboardingUi.setState({ open: true });
}

export function closeOnboarding(): void {
  useOnboardingUi.setState({ open: false });
}

// Settings is its own webview and the dialog lives in the main windows, so the request travels as an event.
export function requestOnboardingRestart(): void {
  persistOnboarding(restart);
  void emit(ONBOARDING_RESTART_EVENT).catch((e) =>
    console.error("[kex] onboarding restart event failed:", e),
  );
}
