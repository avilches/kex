import { create } from "zustand";

type OnboardingUi = { open: boolean };

export const useOnboardingUi = create<OnboardingUi>(() => ({ open: false }));

export function openOnboarding(): void {
  useOnboardingUi.setState({ open: true });
}

export function closeOnboarding(): void {
  useOnboardingUi.setState({ open: false });
}
