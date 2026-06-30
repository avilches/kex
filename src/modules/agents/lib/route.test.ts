import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri APIs before importing the module under test
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({ label: "w-1" })),
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(async () => true),
  requestPermission: vi.fn(async () => "granted"),
  sendNotification: vi.fn(),
}));
vi.mock("@/modules/agents/store/agentStore", () => ({
  useAgentStore: { getState: vi.fn(() => ({ pushNotification: vi.fn() })) },
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: { getState: vi.fn(() => ({ agentNotifications: true })) },
}));
vi.mock("@/modules/agents/components/AgentToast", () => ({
  showAgentToast: vi.fn(),
}));

import { routeAgentNotification } from "@/modules/agents/lib/route";
import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useAgentStore } from "@/modules/agents/store/agentStore";

/** Drain the microtask queue including nested awaits inside async functions. */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("routeAgentNotification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues nav and sends OS notification when app is not focused", async () => {
    const pushNotification = vi.fn();
    vi.mocked(useAgentStore.getState).mockReturnValue({ pushNotification } as never);

    routeAgentNotification({
      source: "terminal",
      agent: "claude",
      kind: "finished",
      title: "claude finished",
      body: "my-project",
      focused: false,
      visible: false,
      allowToast: false,
      workspaceId: "ws-abc",
      tabId: "panel-xyz",
      onActivate: vi.fn(),
    });

    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("agent_queue_nav", {
      windowLabel: "w-1",
      workspaceId: "ws-abc",
      tabId: "panel-xyz",
    });
    expect(sendNotification).toHaveBeenCalledWith({
      title: "claude finished",
      body: "my-project",
    });
    expect(pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "finished", workspaceId: "ws-abc", tabId: "panel-xyz" }),
    );
  });

  it("does not queue nav or send OS notification when focused and visible", async () => {
    routeAgentNotification({
      source: "terminal",
      agent: "claude",
      kind: "finished",
      title: "claude finished",
      focused: true,
      visible: true,
      allowToast: false,
      onActivate: vi.fn(),
    });

    await flushPromises();

    expect(invoke).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not notify when agentNotifications preference is false", async () => {
    const { usePreferencesStore } = await import("@/modules/settings/preferences");
    vi.mocked(usePreferencesStore.getState).mockReturnValue({ agentNotifications: false } as never);

    routeAgentNotification({
      source: "terminal",
      agent: "claude",
      kind: "finished",
      title: "claude finished",
      focused: false,
      visible: false,
      allowToast: false,
      onActivate: vi.fn(),
    });

    await flushPromises();

    expect(invoke).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
