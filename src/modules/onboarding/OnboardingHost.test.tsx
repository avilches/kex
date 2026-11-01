// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingState } from "./lib/onboardingState";

const hydration = vi.hoisted(() => ({ resolve: () => {}, promise: Promise.resolve() }));
vi.mock("@/modules/settings/preferences", async (orig) => {
  const real = await orig<typeof import("@/modules/settings/preferences")>();
  return { ...real, whenHydrated: () => hydration.promise };
});
vi.mock("@/modules/settings/store", async (orig) => {
  const real = await orig<typeof import("@/modules/settings/store")>();
  // Imported at call time: importing it here would wait on this very mock and deadlock.
  const prefs = () => import("@/modules/settings/preferences").then((m) => m.usePreferencesStore);
  return {
    ...real,
    updateOnboarding: async (change: (s: OnboardingState) => OnboardingState) => {
      const usePreferencesStore = await prefs();
      usePreferencesStore.setState({ onboarding: change(usePreferencesStore.getState().onboarding) });
    },
  };
});
const claim = vi.hoisted(() => ({ won: true, calls: 0 }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => {
    if (cmd !== "claim_onboarding_startup") return Promise.resolve(undefined);
    claim.calls += 1;
    return Promise.resolve(claim.won);
  },
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("./OnboardingDialog", () => ({ OnboardingDialog: () => null }));

import { usePreferencesStore } from "@/modules/settings/preferences";
import { OnboardingHost } from "./OnboardingHost";
import { closeOnboarding, useOnboardingUi } from "./onboardingUi";

function setOnboarding(state: Partial<OnboardingState>) {
  usePreferencesStore.setState({
    onboarding: { finished: false, step: "welcome", shown: false, reminded: false, ...state },
  });
}

async function mountHydrated() {
  let resolve: () => void = () => {};
  hydration.promise = new Promise<void>((r) => {
    resolve = r;
  });
  render(<OnboardingHost />);
  await act(async () => {
    resolve();
    await hydration.promise;
  });
}

beforeEach(() => {
  claim.won = true;
  claim.calls = 0;
  toast.mockClear();
  closeOnboarding();
});
afterEach(cleanup);

describe("OnboardingHost", () => {
  it("opens the modal on first run and records shown", async () => {
    setOnboarding({});
    await mountHydrated();
    expect(useOnboardingUi.getState().open).toBe(true);
    expect(usePreferencesStore.getState().onboarding.shown).toBe(true);
    expect(toast).not.toHaveBeenCalled();
  });

  it("waits for hydration before deciding", async () => {
    usePreferencesStore.setState({
      onboarding: { finished: true, step: "welcome", shown: true, reminded: true },
    });
    hydration.promise = new Promise<void>(() => {});
    render(<OnboardingHost />);
    setOnboarding({});
    await act(async () => {});
    expect(useOnboardingUi.getState().open).toBe(false);
  });

  it("reminds once on the next run", async () => {
    setOnboarding({ shown: true, step: "agents" });
    await mountHydrated();
    expect(useOnboardingUi.getState().open).toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toBe("Finish setting up Kex");
    expect(usePreferencesStore.getState().onboarding.reminded).toBe(true);

    const options = toast.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(options.action.label).toBe("Continue");
    act(() => options.action.onClick());
    expect(useOnboardingUi.getState().open).toBe(true);

    cleanup();
    toast.mockClear();
    await mountHydrated();
    expect(toast).not.toHaveBeenCalled();
  });

  it("a window that loses the startup claim neither opens the modal nor reminds", async () => {
    claim.won = false;
    setOnboarding({});
    await mountHydrated();
    expect(claim.calls).toBe(1);
    expect(useOnboardingUi.getState().open).toBe(false);
    expect(usePreferencesStore.getState().onboarding.shown).toBe(false);

    cleanup();
    setOnboarding({ shown: true });
    await mountHydrated();
    expect(toast).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().onboarding.reminded).toBe(false);
  });

  it("does nothing when finished", async () => {
    setOnboarding({ finished: true, shown: true });
    await mountHydrated();
    expect(useOnboardingUi.getState().open).toBe(false);
    expect(toast).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().onboarding).toEqual({
      finished: true,
      step: "welcome",
      shown: true,
      reminded: false,
    });
  });
});
