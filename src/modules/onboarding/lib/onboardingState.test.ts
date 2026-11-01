import { describe, expect, it } from "vitest";
import {
  STYLE_PRESETS,
  chipLabel,
  finish,
  parseOnboarding,
  showChip,
  startupAction,
  stepAfter,
  stepBefore,
  suppressIntegrationToast,
  visibleSteps,
  withReminded,
  withShown,
  withStep,
  type OnboardingState,
} from "./onboardingState";

const fresh: OnboardingState = { finished: false, step: "welcome", shown: false, reminded: false };

describe("parseOnboarding", () => {
  it("is not finished on a fresh install", () => {
    expect(parseOnboarding(undefined, false)).toEqual(fresh);
  });

  it("is finished when there is no value but prior preferences exist", () => {
    expect(parseOnboarding(undefined, true).finished).toBe(true);
  });

  it("is finished when the value is malformed and prior preferences exist", () => {
    expect(parseOnboarding("junk", true).finished).toBe(true);
    expect(parseOnboarding([], true).finished).toBe(true);
    expect(parseOnboarding({ finished: "no" }, true).finished).toBe(true);
  });

  it("keeps what a valid value says", () => {
    const raw = { finished: false, step: "agents", shown: true, reminded: true };
    expect(parseOnboarding(raw, true)).toEqual(raw);
  });

  it("falls back to welcome on an unknown step", () => {
    const raw = { finished: false, step: "nope", shown: true, reminded: false };
    expect(parseOnboarding(raw, true).step).toBe("welcome");
  });
});

describe("steps", () => {
  it("visibleSteps hides permissions outside macOS", () => {
    expect(visibleSteps(true)).toEqual(["welcome", "style", "permissions", "agents", "done"]);
    expect(visibleSteps(false)).toEqual(["welcome", "style", "agents", "done"]);
  });

  it("stepAfter skips permissions outside macOS", () => {
    expect(stepAfter("style", true)).toBe("permissions");
    expect(stepAfter("style", false)).toBe("agents");
  });

  it("stepBefore skips permissions outside macOS and stays at the edges", () => {
    expect(stepBefore("agents", false)).toBe("style");
    expect(stepBefore("welcome", true)).toBe("welcome");
    expect(stepAfter("done", true)).toBe("done");
  });
});

describe("state transitions", () => {
  it("withStep, withShown, withReminded and finish update one field each", () => {
    expect(withStep(fresh, "style").step).toBe("style");
    expect(withShown(fresh).shown).toBe(true);
    expect(withReminded(fresh).reminded).toBe(true);
    expect(finish(fresh).finished).toBe(true);
  });
});

describe("startupAction", () => {
  it("opens the modal when never shown", () => {
    expect(startupAction(fresh)).toBe("openModal");
  });
  it("reminds once after it was shown", () => {
    expect(startupAction(withShown(fresh))).toBe("remind");
  });
  it("does nothing when reminded or finished", () => {
    expect(startupAction(withReminded(withShown(fresh)))).toBe("none");
    expect(startupAction(finish(fresh))).toBe("none");
  });
});

describe("integration toast and chip", () => {
  it("suppressIntegrationToast is true until finished", () => {
    expect(suppressIntegrationToast(fresh)).toBe(true);
    expect(suppressIntegrationToast(finish(fresh))).toBe(false);
  });

  it("showChip is false before the modal was ever shown", () => {
    expect(showChip(fresh)).toBe(false);
    expect(showChip(withShown(fresh))).toBe(true);
    expect(showChip(finish(withShown(fresh)))).toBe(false);
  });

  it("chipLabel counts only visible steps", () => {
    const s = withStep(withShown(fresh), "agents");
    expect(chipLabel(s, true)).toBe("Finish setup 4/5");
    expect(chipLabel(s, false)).toBe("Finish setup 3/4");
    expect(chipLabel(withStep(s, "permissions"), true)).toBe("Finish setup 3/5");
  });
});

describe("STYLE_PRESETS", () => {
  it("maps each style to its git colors and preview behavior", () => {
    expect(STYLE_PRESETS.vscode).toEqual({ explorerGitColorScheme: "vscode", previewOnClick: true });
    expect(STYLE_PRESETS.jetbrains).toEqual({ explorerGitColorScheme: "jetbrains", previewOnClick: false });
  });
});
