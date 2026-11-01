import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { IS_MAC } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { type ReactNode, useState } from "react";
import { finish, type OnboardingStep, stepAfter, stepBefore, visibleSteps, withStep } from "./lib/onboardingState";
import { persistOnboarding } from "./lib/persistOnboarding";
import { closeOnboarding, useOnboardingUi } from "./onboardingUi";
import { AgentsStep } from "./steps/AgentsStep";
import { DoneStep } from "./steps/DoneStep";
import { PermissionsStep } from "./steps/PermissionsStep";
import { StyleStep } from "./steps/StyleStep";
import { WelcomeStep } from "./steps/WelcomeStep";

type StepView = { title: string; description: string; body: (isMac: boolean) => ReactNode };

const VIEWS: Record<OnboardingStep, StepView> = {
  welcome: {
    title: "Welcome to Kex",
    description: "A fast, lightweight terminal made for working alongside coding agents. Let's make it yours.",
    body: (isMac) => <WelcomeStep isMac={isMac} />,
  },
  style: {
    title: "Pick your style",
    description: "Which editor do your hands already know? Kex will feel the same.",
    body: () => <StyleStep />,
  },
  permissions: {
    title: "Let Kex into your folders",
    description: "Agents running in Kex read your files through it, so macOS asks Kex, not the agent.",
    body: () => <PermissionsStep />,
  },
  agents: {
    title: "Connect your coding agents",
    description: "One click and Kex knows when your agents are working, done, or waiting for you.",
    body: () => <AgentsStep />,
  },
  done: {
    title: "You are all set",
    description: "Here is how Kex is configured. Enjoy.",
    body: (isMac) => <DoneStep isMac={isMac} />,
  },
};

export function OnboardingDialog({ isMac = IS_MAC }: { isMac?: boolean }) {
  const open = useOnboardingUi((s) => s.open);
  const saved = usePreferencesStore((s) => s.onboarding.step);
  const steps = visibleSteps(isMac);
  const resume = () => (steps.includes(saved) ? saved : steps[0]);
  const [step, setStep] = useState<OnboardingStep>(resume);
  const [wasOpen, setWasOpen] = useState(open);

  // Each opening resumes the saved step, set during render so the old step never flashes.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(resume());
  }

  const goTo = (next: OnboardingStep) => {
    setStep(next);
    persistOnboarding((s) => withStep(s, next));
  };
  const complete = () => {
    persistOnboarding(finish);
    closeOnboarding();
  };

  const index = steps.indexOf(step);
  const first = index === 0;
  const last = step === "done";
  const view = VIEWS[step];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeOnboarding()}>
      <DialogContent showCloseButton={false} className="gap-5 sm:max-w-xl">
        <div className="flex items-center gap-3">
          <Progress
            value={((index + 1) / steps.length) * 100}
            aria-label="Setup progress"
            className="h-1.5"
          />
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            Step {index + 1} of {steps.length}
          </span>
        </div>
        <DialogHeader>
          <DialogTitle className="text-lg">{view.title}</DialogTitle>
          <DialogDescription className="text-[13px]">{view.description}</DialogDescription>
        </DialogHeader>
        <div key={step} className="max-h-[55vh] min-h-0 overflow-y-auto">
          {view.body(isMac)}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={closeOnboarding}>
            Continue later
          </Button>
          <span className="flex-1" />
          {!first && (
            <Button variant="outline" size="sm" onClick={() => goTo(stepBefore(step, isMac))}>
              Back
            </Button>
          )}
          {!first && !last && (
            <Button variant="ghost" size="sm" onClick={() => goTo(stepAfter(step, isMac))}>
              Skip
            </Button>
          )}
          {last ? (
            <Button size="sm" autoFocus onClick={complete}>
              Finish
            </Button>
          ) : (
            <Button size="sm" autoFocus onClick={() => goTo(stepAfter(step, isMac))}>
              {first ? "Get started" : "Next"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
