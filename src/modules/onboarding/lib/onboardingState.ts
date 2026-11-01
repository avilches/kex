export const ONBOARDING_STEPS = ["welcome", "style", "permissions", "agents", "done"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingState = {
  finished: boolean;
  step: OnboardingStep;
  shown: boolean;
  reminded: boolean;
};

const FINISHED: OnboardingState = { finished: true, step: "welcome", shown: true, reminded: true };

function isStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

// hadStoredPrefs separates a fresh install from an existing user who predates the onboarding.
export function parseOnboarding(raw: unknown, hadStoredPrefs: boolean): OnboardingState {
  if (raw === undefined || raw === null) {
    return hadStoredPrefs
      ? { ...FINISHED }
      : { finished: false, step: "welcome", shown: false, reminded: false };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return { ...FINISHED };
  const { finished, step, shown, reminded } = raw as Record<string, unknown>;
  if (typeof finished !== "boolean") return { ...FINISHED };
  return {
    finished,
    step: isStep(step) ? step : "welcome",
    shown: shown === true,
    reminded: reminded === true,
  };
}

export function visibleSteps(isMac: boolean): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((s) => isMac || s !== "permissions");
}

export function stepAfter(step: OnboardingStep, isMac: boolean): OnboardingStep {
  const steps = visibleSteps(isMac);
  const i = steps.indexOf(step);
  if (i === -1) return steps[0];
  return steps[Math.min(i + 1, steps.length - 1)];
}

export function stepBefore(step: OnboardingStep, isMac: boolean): OnboardingStep {
  const steps = visibleSteps(isMac);
  const i = steps.indexOf(step);
  if (i === -1) return steps[0];
  return steps[Math.max(i - 1, 0)];
}

export function withStep(state: OnboardingState, step: OnboardingStep): OnboardingState {
  return { ...state, step };
}

export function withShown(state: OnboardingState): OnboardingState {
  return { ...state, shown: true };
}

export function withReminded(state: OnboardingState): OnboardingState {
  return { ...state, reminded: true };
}

export function finish(state: OnboardingState): OnboardingState {
  return { ...state, finished: true };
}

export function startupAction(state: OnboardingState): "openModal" | "remind" | "none" {
  if (state.finished) return "none";
  if (!state.shown) return "openModal";
  return state.reminded ? "none" : "remind";
}

export function suppressIntegrationToast(state: OnboardingState): boolean {
  return !state.finished;
}

export function showChip(state: OnboardingState): boolean {
  return !state.finished && state.shown;
}

export function chipLabel(state: OnboardingState, isMac: boolean): string {
  const steps = visibleSteps(isMac);
  const index = Math.max(steps.indexOf(state.step), 0) + 1;
  return `Finish setup ${index}/${steps.length}`;
}

export const STYLE_PRESETS: Record<
  "vscode" | "jetbrains",
  { explorerGitColorScheme: "vscode" | "jetbrains"; previewOnClick: boolean }
> = {
  vscode: { explorerGitColorScheme: "vscode", previewOnClick: true },
  jetbrains: { explorerGitColorScheme: "jetbrains", previewOnClick: false },
};
