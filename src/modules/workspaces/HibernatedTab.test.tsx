// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    lines.read.mockReset();
    lines.read.mockResolvedValue(null);
  });
  afterEach(cleanup);

  it("shows what was captured when the tab went to sleep: title, command and how long ago", () => {
    const { getByText } = render(
      <HibernatedTab tab={{ ...sleeping({ title: "api server", command: "claude --resume abc", agent: "claude" }), title: undefined }} visible focused onWake={() => {}} />,
    );
    expect(getByText("api server")).toBeTruthy();
    expect(getByText("claude --resume abc")).toBeTruthy();
    expect(getByText("Hibernated for 2h")).toBeTruthy();
  });

  it("falls back to the tab title when no title was frozen", () => {
    const { getByText } = render(<HibernatedTab tab={sleeping()} visible focused onWake={() => {}} />);
    expect(getByText("build")).toBeTruthy();
  });

  it("wakes through the Restore button", () => {
    const onWake = vi.fn();
    const { getByText } = render(<HibernatedTab tab={sleeping()} visible focused onWake={onWake} />);
    fireEvent.click(getByText("Restore"));
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("does not read the stored lines while the tab is out of sight", () => {
    render(<HibernatedTab tab={sleeping()} visible={false} focused onWake={() => {}} />);
    expect(lines.read).not.toHaveBeenCalled();
  });

  it("hints both restore shortcuts in the bottom-left corner, as keys joined with or and followed by Restore, and keeps the button clean", () => {
    const { getByRole, container } = render(<HibernatedTab tab={sleeping()} visible focused onWake={() => {}} />);
    expect(getByRole("button").textContent).toBe("Restore");
    const hint = container.querySelector("[data-hibernated-hint]")!;
    expect(hint.textContent).toMatch(/^.+or.+Restore$/);
    expect(hint.querySelectorAll("kbd")).toHaveLength(2);
  });

  it("shows no hint while the tab has no focus, since Enter would not wake it", () => {
    const { getByRole, container } = render(<HibernatedTab tab={sleeping()} visible focused={false} onWake={() => {}} />);
    expect(getByRole("button").textContent).toBe("Restore");
    expect(container.querySelector("[data-hibernated-hint]")).toBeNull();
  });

  it("shows the stored lines behind the placeholder, with their colours, and nothing when there are none", async () => {
    lines.read.mockResolvedValueOnce("\u001b[38;2;255;0;0merror: boom\u001b[0m\nplain");
    const { findByTestId, findByText, rerender } = render(<HibernatedTab tab={sleeping()} visible focused onWake={() => {}} />);
    expect(lines.read).toHaveBeenCalledWith("t1");
    const layer = await findByTestId("hibernated-lines");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    const red = await findByText("error: boom");
    expect(red.getAttribute("style")).toContain("color");
    expect(await findByText("plain")).toBeTruthy();
    rerender(<HibernatedTab tab={{ ...sleeping(), id: "t2" }} visible focused onWake={() => {}} />);
    expect(lines.read).toHaveBeenCalledWith("t2");
  });

  it("survives a failed read: the placeholder shows without lines", async () => {
    lines.read.mockRejectedValueOnce(new Error("no store"));
    const { queryByTestId, getByText } = render(<HibernatedTab tab={sleeping()} visible focused onWake={() => {}} />);
    await Promise.resolve();
    expect(queryByTestId("hibernated-lines")).toBeNull();
    expect(getByText("Restore")).toBeTruthy();
  });

  it("accents the Restore button only while its tab has the focus", () => {
    const { getByRole, rerender } = render(<HibernatedTab tab={sleeping()} visible focused onWake={() => {}} />);
    expect(getByRole("button", { name: /Restore/ }).getAttribute("data-variant")).toBe("default");
    rerender(<HibernatedTab tab={sleeping()} visible focused={false} onWake={() => {}} />);
    expect(getByRole("button", { name: /Restore/ }).getAttribute("data-variant")).toBe("secondary");
  });

  it("shows the folder under the name, preferring the kept worktree", () => {
    const tab = { ...sleeping(), cwd: "/Users/me/proj" };
    const { container, rerender } = render(<HibernatedTab tab={tab} visible focused onWake={() => {}} />);
    expect(container.querySelector("[data-hibernated-value='folder']")?.textContent).toBe("~/proj");
    const kept = { ...tab, hibernation: { ...tab.hibernation, worktreeCwd: "/Users/me/proj/.claude/worktrees/x" } };
    rerender(<HibernatedTab tab={kept} visible focused onWake={() => {}} />);
    expect(container.querySelector("[data-hibernated-value='folder']")?.textContent).toBe("~/proj/.claude/worktrees/x");
  });

  it("sheds the table and then the card as the pane shrinks", () => {
    let notify: (width: number, height: number) => void = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {
          notify = (width, height) => cb([{ contentRect: { width, height } }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    const tab = { ...sleeping({ command: "top" }), cwd: "/Users/me/proj" };
    const { container, queryByText, getByText } = render(<HibernatedTab tab={tab} visible focused onWake={() => {}} />);
    expect(container.querySelector("[data-hibernated-table]")).toBeTruthy();
    act(() => notify(400, 700));
    expect(container.querySelector("[data-hibernated-table]")).toBeNull();
    expect(getByText("build")).toBeTruthy();
    act(() => notify(300, 700));
    expect(queryByText("build")).toBeNull();
    expect(queryByText(/Hibernated for/)).toBeNull();
    expect(getByText("Restore")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("follows a rename of the tab instead of the name frozen at sleep", () => {
    const { getByText, rerender } = render(
      <HibernatedTab tab={{ ...sleeping({ title: "api server" }), title: undefined }} visible focused onWake={() => {}} />,
    );
    expect(getByText("api server")).toBeTruthy();
    rerender(<HibernatedTab tab={{ ...sleeping({ title: "api server" }), title: "renamed" }} visible focused onWake={() => {}} />);
    expect(getByText("renamed")).toBeTruthy();
  });
});
