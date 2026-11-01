// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingState } from "./lib/onboardingState";

const setters = vi.hoisted(() => ({ scheme: vi.fn(), preview: vi.fn() }));
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
    setExplorerGitColorScheme: async (v: "vscode" | "jetbrains") => {
      setters.scheme(v);
      (await prefs()).setState({ explorerGitColorScheme: v });
    },
    setPreviewOnClick: async (v: boolean) => {
      setters.preview(v);
      (await prefs()).setState({ previewOnClick: v });
    },
  };
});
const setOnboardingOpen = vi.hoisted(() => vi.fn((_open: boolean) => Promise.resolve(true)));
vi.mock("@/lib/native", async (orig) => {
  const real = await orig<typeof import("@/lib/native")>();
  return { ...real, native: { ...real.native, setOnboardingOpen } };
});
vi.mock("@/modules/permissions", () => ({ PermissionsList: () => <div>permissions list</div> }));
vi.mock("@/settings/sections/AgentIntegrations", () => ({
  AgentIntegrations: () => <div>agent integrations</div>,
}));

import { usePreferencesStore } from "@/modules/settings/preferences";
import { OnboardingChip } from "./OnboardingChip";
import { OnboardingDialog } from "./OnboardingDialog";
import { closeOnboarding, openOnboarding, useOnboardingUi } from "./onboardingUi";

function setOnboarding(state: Partial<OnboardingState>) {
  usePreferencesStore.setState({
    onboarding: { finished: false, step: "welcome", shown: true, reminded: false, ...state },
  });
}

const onboarding = () => usePreferencesStore.getState().onboarding;

beforeEach(() => {
  setOnboardingOpen.mockClear();
  setters.scheme.mockClear();
  setters.preview.mockClear();
  closeOnboarding();
  usePreferencesStore.setState({ explorerGitColorScheme: "vscode", previewOnClick: true });
});
afterEach(cleanup);

describe("OnboardingDialog", () => {
  it("Continue later keeps the current step", async () => {
    setOnboarding({});
    render(<OnboardingDialog isMac />);
    await act(() => openOnboarding());
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    await screen.findByText("Pick your style");
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Let Kex into your folders");
    expect(onboarding().step).toBe("permissions");

    fireEvent.click(screen.getByRole("button", { name: "Continue later" }));
    expect(useOnboardingUi.getState().open).toBe(false);
    expect(onboarding()).toMatchObject({ step: "permissions", finished: false });
  });

  it("gives the focus back to the active tab when it closes", async () => {
    setOnboarding({ step: "style" });
    const restore = vi.fn();
    render(<OnboardingDialog isMac onRestoreFocus={restore} />);
    await act(() => openOnboarding());
    await screen.findByText("Pick your style");
    expect(restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue later" }));
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
  });

  it("tells Rust the dialog is open, and releases it when it closes", async () => {
    setOnboarding({ step: "style" });
    render(<OnboardingDialog isMac />);
    expect(setOnboardingOpen.mock.calls).toEqual([[false]]);
    await act(() => openOnboarding());
    await screen.findByText("Pick your style");
    expect(setOnboardingOpen).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Continue later" }));
    expect(setOnboardingOpen).toHaveBeenLastCalledWith(false);
    expect(setOnboardingOpen.mock.calls).toEqual([[false], [true], [false]]);
  });

  it("releases the block when it unmounts while open", async () => {
    setOnboarding({ step: "style" });
    const { unmount } = render(<OnboardingDialog isMac />);
    await act(() => openOnboarding());
    await screen.findByText("Pick your style");
    expect(setOnboardingOpen).toHaveBeenLastCalledWith(true);
    unmount();
    expect(setOnboardingOpen).toHaveBeenLastCalledWith(false);
  });

  it("Escape closes it like Continue later", async () => {
    setOnboarding({ step: "style" });
    render(<OnboardingDialog isMac />);
    await act(() => openOnboarding());
    await screen.findByText("Pick your style");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(useOnboardingUi.getState().open).toBe(false));
    expect(onboarding()).toMatchObject({ step: "style", finished: false });
  });

  it("the chip label reopens at the saved step", async () => {
    setOnboarding({ step: "agents" });
    render(
      <>
        <OnboardingChip isMac />
        <OnboardingDialog isMac />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish setup 4/5" }));
    expect(await screen.findByText("Connect your coding agents")).toBeTruthy();
    expect(await screen.findByText("agent integrations")).toBeTruthy();
  });

  it("Back goes to the previous step and saves it", async () => {
    setOnboarding({ step: "agents" });
    render(<OnboardingDialog isMac={false} />);
    await act(() => openOnboarding());
    await screen.findByText("Connect your coding agents");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Pick your style");
    expect(onboarding().step).toBe("style");
  });

  it("style step applies the JetBrains preset", async () => {
    setOnboarding({ step: "style" });
    render(<OnboardingDialog isMac />);
    await act(() => openOnboarding());
    const vscode = await screen.findByRole("radio", { name: /VS Code/ });
    expect(vscode.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /JetBrains/ }));
    await waitFor(() => expect(setters.scheme).toHaveBeenCalledWith("jetbrains"));
    expect(setters.preview).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /JetBrains/ }).getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("permissions step is absent outside macOS", async () => {
    setOnboarding({ step: "style" });
    render(<OnboardingDialog isMac={false} />);
    await act(() => openOnboarding());
    await screen.findByText("Pick your style");
    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Connect your coding agents");
    expect(screen.queryByText("Let Kex into your folders")).toBeNull();
    expect(onboarding().step).toBe("agents");
  });

  it("a saved permissions step opens at the first step outside macOS", async () => {
    setOnboarding({ step: "permissions" });
    render(<OnboardingDialog isMac={false} />);
    await act(() => openOnboarding());
    expect(await screen.findByText("Welcome to Kex")).toBeTruthy();
  });

  it("finishing marks the onboarding finished and hides the chip", async () => {
    setOnboarding({ step: "done" });
    render(
      <>
        <OnboardingChip isMac />
        <OnboardingDialog isMac />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish setup 5/5" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));
    await waitFor(() => expect(onboarding().finished).toBe(true));
    expect(useOnboardingUi.getState().open).toBe(false);
    expect(screen.queryByRole("button", { name: /Finish setup/ })).toBeNull();
  });

  it("on the Done step there is no Continue later and closing finishes the onboarding", async () => {
    setOnboarding({ step: "done" });
    render(
      <>
        <OnboardingChip isMac />
        <OnboardingDialog isMac />
      </>,
    );
    await act(() => openOnboarding());
    await screen.findByText("You are all set");
    expect(screen.queryByRole("button", { name: "Continue later" })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onboarding().finished).toBe(true));
    expect(useOnboardingUi.getState().open).toBe(false);
    expect(screen.queryByRole("button", { name: /Finish setup/ })).toBeNull();
  });
});

describe("OnboardingChip", () => {
  it("is hidden before the modal was ever shown", () => {
    setOnboarding({ shown: false });
    render(<OnboardingChip isMac />);
    expect(screen.queryByRole("button", { name: /Finish setup/ })).toBeNull();
  });

  it("Dismiss setup finishes the onboarding", async () => {
    setOnboarding({ step: "style" });
    render(<OnboardingChip isMac />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Setup options" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Dismiss setup" }));
    await waitFor(() => expect(onboarding().finished).toBe(true));
    expect(screen.queryByRole("button", { name: /Finish setup/ })).toBeNull();
  });
});
