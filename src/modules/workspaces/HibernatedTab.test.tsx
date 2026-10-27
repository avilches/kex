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

const lines = vi.hoisted(() => ({ read: vi.fn(async (_tabId: string): Promise<string | null> => null) }));
vi.mock("./lib/hibernateLinesIo", () => ({ readHibernateLines: lines.read }));

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
    lines.read.mockReset();
    lines.read.mockResolvedValue(null);
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

  it("shows the folder of the session but not the last agent message", async () => {
    sessionRestore.sessionPreviews.mockResolvedValue([
      { tabId: "t1", cwd: "/Users/me/proj", lastMessage: "Tests are green", updatedAt: Math.floor(Date.now() / 1000) - 3600 },
    ]);
    const { findByText, queryByText } = render(<HibernatedTab tab={sleeping({ agent: "claude" })} visible onWake={() => {}} />);
    expect(await findByText(/~\/proj/)).toBeTruthy();
    expect(queryByText("Tests are green")).toBeNull();
    expect(sessionRestore.sessionPreviews).toHaveBeenCalledWith(["t1"]);
  });

  it("does not read the session while the tab is out of sight", () => {
    render(<HibernatedTab tab={sleeping()} visible={false} onWake={() => {}} />);
    expect(sessionRestore.sessionPreviews).not.toHaveBeenCalled();
    expect(lines.read).not.toHaveBeenCalled();
  });

  it("shows the Enter shortcut on the Restore button and no other hint", () => {
    const { getByRole, queryByText } = render(<HibernatedTab tab={sleeping()} visible onWake={() => {}} />);
    expect(getByRole("button").textContent).toMatch(/^Restore.+$/);
    expect(queryByText(/^Press /)).toBeNull();
  });

  it("shows the stored lines behind the placeholder, with their colours, and nothing when there are none", async () => {
    lines.read.mockResolvedValueOnce("\u001b[38;2;255;0;0merror: boom\u001b[0m\nplain");
    const { findByTestId, findByText, rerender } = render(<HibernatedTab tab={sleeping()} visible onWake={() => {}} />);
    expect(lines.read).toHaveBeenCalledWith("t1");
    const layer = await findByTestId("hibernated-lines");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    const red = await findByText("error: boom");
    expect(red.getAttribute("style")).toContain("color");
    expect(await findByText("plain")).toBeTruthy();
    rerender(<HibernatedTab tab={{ ...sleeping(), id: "t2" }} visible onWake={() => {}} />);
    expect(lines.read).toHaveBeenCalledWith("t2");
  });

  it("survives a failed read: the placeholder shows without lines", async () => {
    lines.read.mockRejectedValueOnce(new Error("no store"));
    const { queryByTestId, getByText } = render(<HibernatedTab tab={sleeping()} visible onWake={() => {}} />);
    await Promise.resolve();
    expect(queryByTestId("hibernated-lines")).toBeNull();
    expect(getByText("Restore")).toBeTruthy();
  });
});
