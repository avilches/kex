// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionRestore = vi.hoisted(() => ({
  sessionPreviews: vi.fn(
    async (
      _tabIds: string[],
    ): Promise<{ tabId: string; cwd: string; lastMessage?: string | null; updatedAt: number }[]> => [],
  ),
}));

vi.mock("@/modules/agents/lib/agentSessionRestore", () => ({
  sessionPreviews: sessionRestore.sessionPreviews,
}));
vi.mock("@/lib/homeDir", () => ({ cachedHomeDir: () => "/Users/me" }));

import { HibernatedTab } from "./HibernatedTab";
import type { SleepingTab } from "./lib/hibernate";

const sleeping = (over: Partial<SleepingTab["hibernation"]> = {}): SleepingTab => ({
  id: "t1",
  kind: "terminal",
  title: "build",
  hibernation: { at: Date.now() - 2 * 60 * 60_000, ...over },
});

describe("HibernatedTab", () => {
  beforeEach(() => {
    sessionRestore.sessionPreviews.mockReset();
    sessionRestore.sessionPreviews.mockResolvedValue([]);
  });
  afterEach(cleanup);

  it("shows what was captured when the tab went to sleep: title, command and how long ago", () => {
    const { getByText } = render(
      <HibernatedTab tab={sleeping({ title: "api server", command: "claude --resume abc", agent: "claude" })} visible onWake={() => {}} />,
    );
    expect(getByText("api server")).toBeTruthy();
    expect(getByText("claude --resume abc")).toBeTruthy();
    expect(getByText("Hibernated for 2h")).toBeTruthy();
  });

  it("falls back to the tab title when no title was frozen", () => {
    const { getByText } = render(<HibernatedTab tab={sleeping()} visible onWake={() => {}} />);
    expect(getByText("build")).toBeTruthy();
  });

  it("wakes through the Restore button", () => {
    const onWake = vi.fn();
    const { getByText } = render(<HibernatedTab tab={sleeping()} visible onWake={onWake} />);
    fireEvent.click(getByText("Restore"));
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("reads the last agent message and folder of the session while it is shown", async () => {
    sessionRestore.sessionPreviews.mockResolvedValue([
      { tabId: "t1", cwd: "/Users/me/proj", lastMessage: "Tests are green", updatedAt: Math.floor(Date.now() / 1000) - 3600 },
    ]);
    const { findByText } = render(<HibernatedTab tab={sleeping({ agent: "claude" })} visible onWake={() => {}} />);
    expect(await findByText("Tests are green")).toBeTruthy();
    expect(await findByText(/~\/proj/)).toBeTruthy();
    expect(sessionRestore.sessionPreviews).toHaveBeenCalledWith(["t1"]);
  });

  it("does not read the session while the tab is out of sight", () => {
    render(<HibernatedTab tab={sleeping()} visible={false} onWake={() => {}} />);
    expect(sessionRestore.sessionPreviews).not.toHaveBeenCalled();
  });
});
