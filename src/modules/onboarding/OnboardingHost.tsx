import { usePreferencesStore, whenHydrated } from "@/modules/settings/preferences";
import { useEffect } from "react";
import { toast } from "sonner";
import { startupAction, withReminded, withShown } from "./lib/onboardingState";
import { persistOnboarding } from "./lib/persistOnboarding";
import { OnboardingDialog } from "./OnboardingDialog";
import { openOnboarding } from "./onboardingUi";

function remind(): void {
  toast("Finish setting up Kex", {
    id: "onboarding-reminder",
    description: "Only a few steps left. Pick up right where you stopped.",
    action: { label: "Continue", onClick: openOnboarding },
    duration: 15_000,
    closeButton: true,
  });
}

// Until hydration the stored state is the default, which says finished, so deciding earlier
// would never show anything.
export function OnboardingHost() {
  useEffect(() => {
    let cancelled = false;
    void whenHydrated().then(() => {
      if (cancelled) return;
      const action = startupAction(usePreferencesStore.getState().onboarding);
      if (action === "openModal") {
        openOnboarding();
        persistOnboarding(withShown);
      } else if (action === "remind") {
        remind();
        persistOnboarding(withReminded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <OnboardingDialog />;
}
