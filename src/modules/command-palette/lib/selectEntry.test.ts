import { describe, expect, it, vi } from "vitest";
import { selectTab, selectWorkspace } from "./selectEntry";

describe("selectTab", () => {
  it("navigates straight away when the tab is awake", async () => {
    const wake = vi.fn(async () => {});
    const goToTab = vi.fn();
    await selectTab({ tabId: "t", workspaceId: "w", hibernated: false }, { wake, goToTab });
    expect(wake).not.toHaveBeenCalled();
    expect(goToTab).toHaveBeenCalledWith("t");
  });

  it("wakes a hibernated tab before navigating", async () => {
    const calls: string[] = [];
    await selectTab(
      { tabId: "t", workspaceId: "w", hibernated: true },
      {
        wake: async (workspaceId, tabId) => {
          calls.push(`wake:${workspaceId}:${tabId}`);
        },
        goToTab: (id) => {
          calls.push(`go:${id}`);
        },
      },
    );
    expect(calls).toEqual(["wake:w:t", "go:t"]);
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
  it("activates the workspace", () => {
    const activate = vi.fn();
    selectWorkspace({ workspaceId: "w" }, { activate });
    expect(activate).toHaveBeenCalledWith("w");
  });
});
