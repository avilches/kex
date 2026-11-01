// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/onboarding", () => ({
  OnboardingChip: () => <div>setup chip</div>,
}));
vi.mock("./WorkspaceTitle", () => ({
  WorkspaceTitle: () => <div>workspace title</div>,
}));

import { usePreferencesStore } from "@/modules/settings/preferences";
import { HeaderLead } from "./HeaderLead";

const props = { workspace: null, tab: null, groups: [] };

const setState = (onboarding: { finished: boolean; shown: boolean }) =>
  usePreferencesStore.setState({ onboarding: { ...onboarding, step: "style", reminded: true } });

beforeEach(() => setState({ finished: true, shown: true }));
afterEach(cleanup);

describe("HeaderLead", () => {
  it("shows the workspace title once the setup is finished", () => {
    render(<HeaderLead {...props} />);
    expect(screen.getByText("workspace title")).toBeTruthy();
    expect(screen.queryByText("setup chip")).toBeNull();
  });

  it("puts the chip in the title's place while the setup is pending and was shown", () => {
    setState({ finished: false, shown: true });
    render(<HeaderLead {...props} />);
    expect(screen.getByText("setup chip")).toBeTruthy();
    expect(screen.queryByText("workspace title")).toBeNull();
  });

  it("keeps the title before the dialog was ever shown, since there is no chip yet", () => {
    setState({ finished: false, shown: false });
    render(<HeaderLead {...props} />);
    expect(screen.getByText("workspace title")).toBeTruthy();
    expect(screen.queryByText("setup chip")).toBeNull();
  });

  it("brings the title back as soon as the setup is dismissed", () => {
    setState({ finished: false, shown: true });
    render(<HeaderLead {...props} />);
    expect(screen.queryByText("workspace title")).toBeNull();
    usePreferencesStore.setState({
      onboarding: { finished: true, step: "style", shown: true, reminded: true },
    });
    cleanup();
    render(<HeaderLead {...props} />);
    expect(screen.getByText("workspace title")).toBeTruthy();
  });
});
