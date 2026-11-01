import { native } from "@/lib/native";
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
// would never show anything. Only the window that wins the per-process claim decides, so
// restored or new windows never repeat the modal or eat the reminder of the next launch.
export function OnboardingHost() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await whenHydrated();
      if (cancelled) return;
      const won = await native.claimOnboardingStartup().catch(() => false);
      if (!won || cancelled) return;
      const action = startupAction(usePreferencesStore.getState().onboarding);
      if (action === "openModal") {
        openOnboarding();
        persistOnboarding(withShown);
      } else if (action === "remind") {
        remind();
        persistOnboarding(withReminded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <OnboardingDialog />;
}
