import { updateOnboarding } from "@/modules/settings/store";
import type { OnboardingState } from "./onboardingState";

export function persistOnboarding(change: (state: OnboardingState) => OnboardingState): void {
  updateOnboarding(change).catch((e) => console.error("[kex] saving the onboarding state failed:", e));
}
