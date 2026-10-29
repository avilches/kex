// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { WorkspaceMark } from "./WorkspaceMark";

afterEach(() => {
  cleanup();
  usePreferencesStore.setState({ defaultWorkspaceIcon: "LayersIcon" });
});

describe("WorkspaceMark", () => {
  it("draws the default icon when the workspace has none", () => {
    const { container } = render(<WorkspaceMark id="ws-1" color="#3b82f6" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("draws the color dot when the default icon is none", () => {
    usePreferencesStore.setState({ defaultWorkspaceIcon: "" });
    const { container } = render(<WorkspaceMark id="ws-1" color="#3b82f6" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("span[aria-hidden]")).not.toBeNull();
  });

  it("keeps the workspace's own icon over the default", () => {
    const own = render(<WorkspaceMark id="ws-1" icon="HeartIcon" />).container.innerHTML;
    cleanup();
    const dflt = render(<WorkspaceMark id="ws-1" />).container.innerHTML;
    expect(own).not.toBe(dflt);
  });
});
