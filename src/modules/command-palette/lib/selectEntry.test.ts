import { describe, expect, it, vi } from "vitest";
import { selectTab, selectWorkspace } from "./selectEntry";

describe("selectTab", () => {
  it("navigates straight away when the workspace is awake", async () => {
    const wake = vi.fn(async () => {});
    const goToTab = vi.fn();
    await selectTab({ tabId: "t", workspaceId: "w", hibernated: false }, { wake, goToTab });
    expect(wake).not.toHaveBeenCalled();
    expect(goToTab).toHaveBeenCalledWith("t");
  });

  it("wakes a hibernated workspace before navigating", async () => {
    const calls: string[] = [];
    await selectTab(
      { tabId: "t", workspaceId: "w", hibernated: true },
      {
        wake: async (id) => {
          calls.push(`wake:${id}`);
        },
        goToTab: (id) => {
          calls.push(`go:${id}`);
        },
      },
    );
    expect(calls).toEqual(["wake:w", "go:t"]);
  });

  it("does not navigate when the wake fails", async () => {
    const goToTab = vi.fn();
    await expect(
      selectTab(
        { tabId: "t", workspaceId: "w", hibernated: true },
        { wake: async () => { throw new Error("boom"); }, goToTab },
      ),
    ).rejects.toThrow("boom");
    expect(goToTab).not.toHaveBeenCalled();
  });
});

describe("selectWorkspace", () => {
  it("wakes a hibernated workspace and then activates it", async () => {
    const calls: string[] = [];
    await selectWorkspace(
      { workspaceId: "w", hibernated: true },
      { wake: async () => { calls.push("wake"); }, activate: () => { calls.push("activate"); } },
    );
    expect(calls).toEqual(["wake", "activate"]);
  });

  it("only activates an awake workspace", async () => {
    const wake = vi.fn(async () => {});
    const activate = vi.fn();
    await selectWorkspace({ workspaceId: "w", hibernated: false }, { wake, activate });
    expect(wake).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledWith("w");
  });
});
