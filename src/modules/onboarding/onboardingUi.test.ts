// @vitest-environment happy-dom

import { MOD_PROP } from "@/lib/platform";
import { useGlobalShortcuts } from "@/modules/shortcuts/lib/useGlobalShortcuts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  setOnboardingOpen: vi.fn((_open: boolean) => Promise.resolve(true)),
  requestOnboardingRestart: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/native", () => ({ native }));
const emit = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/api/event", () => ({ emit, listen: () => Promise.resolve(() => {}) }));
const persist = vi.hoisted(() => ({
  saveOnboarding: vi.fn((_change: unknown): Promise<void> => Promise.resolve()),
}));
vi.mock("./lib/persistOnboarding", () => persist);

import {
  closeOnboarding,
  isOnboardingOpen,
  openOnboarding,
  requestOnboardingRestart,
  useOnboardingUi,
} from "./onboardingUi";

beforeEach(() => {
  native.setOnboardingOpen.mockClear().mockImplementation(() => Promise.resolve(true));
  native.requestOnboardingRestart.mockClear();
  persist.saveOnboarding.mockClear().mockImplementation(() => Promise.resolve());
  emit.mockClear();
});

afterEach(() => {
  cleanup();
  closeOnboarding();
});

const showDialog = () => useOnboardingUi.setState({ open: true });

function pressCloseTab(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "w", metaKey: MOD_PROP === "meta", ctrlKey: MOD_PROP === "ctrl" }),
  );
}

describe("isOnboardingOpen as a global shortcut gate", () => {
  it("blocks a shortcut while the onboarding is open and lets it through once it closes", () => {
    const closeTab = vi.fn();
    renderHook(() => useGlobalShortcuts({ "tab.close": closeTab }, { isDisabled: () => isOnboardingOpen() }));

    act(showDialog);
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

    act(showDialog);
    press();
    expect(newWindow).not.toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();

    act(() => closeOnboarding());
    press();
    expect(newWindow).toHaveBeenCalledTimes(1);
    expect(settings).toHaveBeenCalledTimes(1);
  });
});

describe("openOnboarding", () => {
  it("opens the dialog once this window gets the block", async () => {
    await openOnboarding();
    expect(native.setOnboardingOpen).toHaveBeenCalledWith(true);
    expect(isOnboardingOpen()).toBe(true);
  });

  it("does not open a second dialog when another window holds the block", async () => {
    native.setOnboardingOpen.mockImplementation(() => Promise.resolve(false));
    await openOnboarding();
    // The refused request is what makes Rust bring the holder to the front.
    expect(native.setOnboardingOpen).toHaveBeenCalledWith(true);
    expect(isOnboardingOpen()).toBe(false);
  });
});

describe("requestOnboardingRestart", () => {
  it("asks Rust to restart it in one window instead of broadcasting", async () => {
    await requestOnboardingRestart();
    expect(native.requestOnboardingRestart).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it("saves the restart before asking Rust, because opening the dialog closes Settings", async () => {
    let finishSave: () => void = () => {};
    persist.saveOnboarding.mockImplementation(
      () => new Promise<void>((resolve) => (finishSave = resolve)),
    );
    const pending = requestOnboardingRestart();
    await Promise.resolve();
    expect(native.requestOnboardingRestart).not.toHaveBeenCalled();
    finishSave();
    await pending;
    expect(native.requestOnboardingRestart).toHaveBeenCalledTimes(1);
  });

  it("does not open the dialog on a state it failed to save", async () => {
    persist.saveOnboarding.mockImplementation(() => Promise.reject(new Error("disk")));
    await requestOnboardingRestart();
    expect(native.requestOnboardingRestart).not.toHaveBeenCalled();
  });
});
