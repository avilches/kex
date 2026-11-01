import { OnboardingChip } from "@/modules/onboarding";
import { showChip } from "@/modules/onboarding/lib/onboardingState";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { WorkspaceTitle } from "./WorkspaceTitle";

type Props = Parameters<typeof WorkspaceTitle>[0];

// While the setup is pending the chip takes the title's place, so it sits where the eye already
// is and no other control has to give up room for it.
export function HeaderLead(props: Props) {
  const pending = usePreferencesStore((s) => showChip(s.onboarding));
  return pending ? <OnboardingChip /> : <WorkspaceTitle {...props} />;
}
