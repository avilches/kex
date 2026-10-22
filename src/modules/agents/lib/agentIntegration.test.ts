import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

let installed: string[] = [];
let suggestions: Record<string, unknown> = {};
const setAgentNotifications = vi.fn(() => Promise.resolve());
vi.mock("@/modules/settings/store", () => ({
  setAgentNotifications: (...a: unknown[]) => setAgentNotifications(...(a as [])),
  updateInstalledIntegrations: (change: (c: string[]) => string[]) => {
    installed = change(installed);
    return Promise.resolve();
  },
  updateIntegrationSuggestions: (change: (m: Record<string, unknown>) => Record<string, unknown>) => {
    suggestions = change(suggestions);
    return Promise.resolve();
  },
}));

import { installAgent, removeAgent } from "./agentIntegration";

beforeEach(() => {
  installed = [];
  suggestions = {};
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  setAgentNotifications.mockClear();
});

describe("installAgent", () => {
  it("installs Claude hooks, turns agent notifications on and records the install", async () => {
    await installAgent("claude");
    expect(invoke).toHaveBeenCalledWith("agent_enable_claude_hooks");
    expect(setAgentNotifications).toHaveBeenCalledWith(true);
    expect(suggestions.claude).toMatchObject({ installedOnce: true });
  });

  it("installs a file agent, tracks it and records the install", async () => {
    await installAgent("pi");
    expect(invoke).toHaveBeenCalledWith("agent_setup_pi");
    expect(installed).toEqual(["pi"]);
    expect(suggestions.pi).toMatchObject({ installedOnce: true });
  });

  it("records nothing when the install fails", async () => {
    invoke.mockRejectedValue(new Error("read-only"));
    await expect(installAgent("omp")).rejects.toThrow();
    expect(suggestions).toEqual({});
  });

  it("keeps the installed-once record after the agent is removed", async () => {
    await installAgent("omp");
    await removeAgent("omp");
    expect(installed).toEqual([]);
    expect(suggestions.omp).toMatchObject({ installedOnce: true });
  });
});
