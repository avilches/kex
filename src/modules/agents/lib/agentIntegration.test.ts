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

const runEditorScan = vi.fn<() => Promise<{ id: string; kind: string }[] | null>>();
vi.mock("@/modules/external-editors/useExternalEditors", () => ({
  runEditorScan: () => runEditorScan(),
}));

import {
  AgentNotDetectedError,
  assertDetected,
  installAgent,
  installErrorText,
  removeAgent,
} from "./agentIntegration";

beforeEach(() => {
  runEditorScan.mockReset();
  runEditorScan.mockResolvedValue([]);
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

describe("installErrorText", () => {
  it("uses the not-found message and falls back for any other failure", () => {
    expect(installErrorText(new AgentNotDetectedError("omp"), "fallback")).toBe(
      "OMP was not found on this machine",
    );
    expect(installErrorText(new Error("EACCES"), "fallback")).toBe("fallback");
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

  it("rescans once when the agent was missed and installs if the scan finds it", async () => {
    detectedEditors = [];
    runEditorScan.mockResolvedValue([{ id: "pi", kind: "agent" }]);
    await installAgent("pi");
    expect(runEditorScan).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("agent_setup_pi");
    expect(installed).toEqual(["pi"]);
  });

  it("throws a not-found error and writes nothing when the rescan still misses it", async () => {
    detectedEditors = [];
    runEditorScan.mockResolvedValue([{ id: "claude", kind: "agent" }]);
    const err = await installAgent("pi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentNotDetectedError);
    expect((err as Error).message).toBe("Pi was not found on this machine");
    expect(runEditorScan).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(installed).toEqual([]);
    expect(suggestions).toEqual({});
  });

  it("throws a not-found error when the rescan itself fails", async () => {
    detectedEditors = [];
    runEditorScan.mockResolvedValue(null);
    await expect(installAgent("claude")).rejects.toThrow("Claude Code was not found on this machine");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not rescan when the agent is already detected", async () => {
    await installAgent("pi");
    expect(runEditorScan).not.toHaveBeenCalled();
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
