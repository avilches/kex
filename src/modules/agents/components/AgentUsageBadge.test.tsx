// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAgentStore } from "../store/agentStore";
import { AgentUsageBadge } from "./AgentUsageBadge";

afterEach(cleanup);
beforeEach(() => {
  useAgentStore.setState({ usage: {} });
});

describe("AgentUsageBadge", () => {
  it("renders nothing without a reading", () => {
    const { container } = render(<AgentUsageBadge tabId="tab-1" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the reading with its detail as a native tooltip and goes away when cleared", () => {
    const { container } = render(<AgentUsageBadge tabId="tab-1" />);
    act(() =>
      useAgentStore.getState().setUsage("tab-1", { contextUsedPct: 42 }),
    );
    const badge = container.querySelector("span");
    expect(badge?.textContent).toBe("42%");
    expect(badge?.getAttribute("title")).toBe("Context: 42% used");
    act(() => useAgentStore.getState().setUsage("tab-1", {}));
    expect(container.innerHTML).toBe("");
  });

  it("ignores another tab's reading", () => {
    const { container } = render(<AgentUsageBadge tabId="tab-1" />);
    act(() =>
      useAgentStore.getState().setUsage("tab-2", { contextUsedPct: 42 }),
    );
    expect(container.innerHTML).toBe("");
  });
});
