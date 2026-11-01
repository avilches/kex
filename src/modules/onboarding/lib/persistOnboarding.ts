import { updateOnboarding } from "@/modules/settings/store";
import type { OnboardingState } from "./onboardingState";

type Change = (state: OnboardingState) => OnboardingState;

// For callers that must act after the state is on disk, like a window that is about to be closed.
export function saveOnboarding(change: Change): Promise<void> {
  return updateOnboarding(change);
}

export function persistOnboarding(change: Change): void {
  saveOnboarding(change).catch((e) => console.error("[kex] saving the onboarding state failed:", e));
}
