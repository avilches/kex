// @vitest-environment happy-dom

import { MOD_PROP } from "@/lib/platform";
import { useGlobalShortcuts } from "@/modules/shortcuts/lib/useGlobalShortcuts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeOnboarding, isOnboardingOpen, openOnboarding } from "./onboardingUi";

afterEach(() => {
  cleanup();
  closeOnboarding();
});

function pressCloseTab(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "w", metaKey: MOD_PROP === "meta", ctrlKey: MOD_PROP === "ctrl" }),
  );
}

describe("isOnboardingOpen as a global shortcut gate", () => {
  it("blocks a shortcut while the onboarding is open and lets it through once it closes", () => {
    const closeTab = vi.fn();
    renderHook(() => useGlobalShortcuts({ "tab.close": closeTab }, { isDisabled: () => isOnboardingOpen() }));

    act(() => openOnboarding());
    pressCloseTab();
    expect(closeTab).not.toHaveBeenCalled();

    act(() => closeOnboarding());
    pressCloseTab();
    expect(closeTab).toHaveBeenCalledTimes(1);
  });

  it("blocks New Window and Open Settings while the onboarding is open", () => {
    const newWindow = vi.fn();
    const settings = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({ "window.new": newWindow, "settings.open": settings }, { isDisabled: () => isOnboardingOpen() }),
    );
    const mod = { metaKey: MOD_PROP === "meta", ctrlKey: MOD_PROP === "ctrl" };
    const press = () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "N", shiftKey: true, ...mod }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ...mod }));
    };

    act(() => openOnboarding());
    press();
    expect(newWindow).not.toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();

    act(() => closeOnboarding());
    press();
    expect(newWindow).toHaveBeenCalledTimes(1);
    expect(settings).toHaveBeenCalledTimes(1);
  });
});
