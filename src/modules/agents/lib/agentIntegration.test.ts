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

let detectedEditors: { id: string; kind: string }[] = [];
let hydration: Promise<void> = Promise.resolve();
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: { getState: () => ({ detectedEditors }) },
  whenHydrated: () => hydration,
}));

import { AgentNotDetectedError, assertDetected, installAgent, removeAgent } from "./agentIntegration";

beforeEach(() => {
  installed = [];
  suggestions = {};
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  setAgentNotifications.mockClear();
  hydration = Promise.resolve();
  detectedEditors = ["claude", "codex", "opencode", "omp", "pi"].map((id) => ({ id, kind: "agent" }));
});

describe("assertDetected", () => {
  it("throws for an agent that is not detected", () => {
    expect(() => assertDetected("pi", new Set(["claude"]))).toThrow(AgentNotDetectedError);
    expect(() => assertDetected("claude", new Set(["claude"]))).not.toThrow();
  });
});

describe("installAgent", () => {
  it("writes nothing when the agent is not detected", async () => {
    detectedEditors = [];
    await expect(installAgent("pi")).rejects.toThrow(AgentNotDetectedError);
    expect(invoke).not.toHaveBeenCalled();
    expect(installed).toEqual([]);
    expect(suggestions).toEqual({});
  });

  it("waits for preferences to hydrate before reading detection", async () => {
    detectedEditors = [];
    let hydrate: () => void = () => {};
    hydration = new Promise<void>((r) => {
      hydrate = r;
    });
    const p = installAgent("pi");
    detectedEditors = [{ id: "pi", kind: "agent" }];
    hydrate();
    await p;
    expect(invoke).toHaveBeenCalledWith("agent_setup_pi");
  });

  it("installs Claude hooks, turns agent notifications on and records the install", async () => {
    await installAgent("claude");
    expect(invoke).toHaveBeenCalledWith("agent_enable_claude_hooks", { refresh: true });
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
