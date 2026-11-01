import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import type { Preferences } from "@/modules/settings/store";
import { runStartupSync } from "@/modules/agents/lib/startupSync";

const claude = { id: "claude", kind: "agent" } as Preferences["detectedEditors"][number];

function prefs(agentNotifications: boolean) {
  return { detectedEditors: [claude], installedIntegrations: [], agentNotifications };
}

// Outdated hooks: present in settings.json, but the full status check says not current.
function outdatedHooks() {
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "agent_claude_hooks_present") return Promise.resolve(true);
    if (cmd === "agent_claude_hooks_status") return Promise.resolve(false);
    return Promise.resolve(undefined);
  });
}

const called = (cmd: string) => invoke.mock.calls.some(([c]) => c === cmd);

describe("runStartupSync", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("refreshes outdated hooks", async () => {
    outdatedHooks();
    await runStartupSync(prefs(true), vi.fn());
    expect(invoke).toHaveBeenCalledWith("agent_enable_claude_hooks", { refresh: false });
    expect(called("agent_claude_hooks_status")).toBe(false);
  });

  it("removes outdated hooks when notifications are off", async () => {
    outdatedHooks();
    await runStartupSync(prefs(false), vi.fn());
    expect(called("agent_disable_claude_hooks")).toBe(true);
    expect(called("agent_enable_claude_hooks")).toBe(false);
  });

  it("does not ask about hooks when claude is not detected", async () => {
    outdatedHooks();
    await runStartupSync({ ...prefs(true), detectedEditors: [] }, vi.fn());
    expect(invoke).not.toHaveBeenCalled();
  });

  it("swallows a failing presence check", async () => {
    invoke.mockImplementation(() => Promise.reject(new Error("boom")));
    await expect(runStartupSync(prefs(true), vi.fn())).resolves.toBeUndefined();
    expect(called("agent_enable_claude_hooks")).toBe(false);
  });
});
