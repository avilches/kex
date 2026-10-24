import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import type { IntegrationAgent } from "./integrations";
import {
  installIntegration,
  integrationStatus,
  removeIntegration,
  syncIntegrations,
} from "./integrationActions";

// A store whose update applies the change to a list, like updateInstalledIntegrations does.
function fakeStore(initial: IntegrationAgent[] = []) {
  const state = { list: initial };
  const update = vi.fn((change: (c: IntegrationAgent[]) => IntegrationAgent[]) => {
    state.list = change(state.list);
    return Promise.resolve();
  });
  return { state, update };
}

beforeEach(() => {
  invoke.mockClear();
  invoke.mockImplementation(() => Promise.resolve(undefined));
});

async function failureOf(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
  } catch (e) {
    return String(e);
  }
  return "did not fail";
}

describe("installIntegration", () => {
  it("writes the file first and then remembers the agent", async () => {
    const { state, update } = fakeStore(["pi"]);
    await installIntegration("omp", update);
    expect(invoke).toHaveBeenCalledWith("agent_setup_omp");
    expect(state.list).toEqual(["omp", "pi"]);
    expect(invoke.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  });

  it("does not remember the agent when the file could not be written", async () => {
    invoke.mockImplementation(() => Promise.reject(new Error("disk full")));
    const { state, update } = fakeStore();
    expect(await failureOf(() => installIntegration("pi", update))).toContain("disk full");
    expect(update).not.toHaveBeenCalled();
    expect(state.list).toEqual([]);
  });

  it("keeps the other agents when two installs run at once", async () => {
    const { state, update } = fakeStore();
    await Promise.all([installIntegration("omp", update), installIntegration("pi", update)]);
    expect(state.list).toEqual(["omp", "pi"]);
  });
});

describe("installIntegration for Codex", () => {
  it("runs the Codex setup and remembers codex", async () => {
    const { state, update } = fakeStore(["omp"]);
    await installIntegration("codex", update);
    expect(invoke).toHaveBeenCalledWith("agent_setup_codex");
    expect(state.list).toEqual(["omp", "codex"]);
  });

  it("does not remember codex when its config cannot be parsed", async () => {
    invoke.mockImplementation(() => Promise.reject(new Error("leaving it alone")));
    const { state, update } = fakeStore();
    expect(await failureOf(() => installIntegration("codex", update))).toContain("leaving it alone");
    expect(state.list).toEqual([]);
  });
});

describe("integrationStatus", () => {
  it("reads the boolean status of a file-based agent", async () => {
    invoke.mockImplementation(() => Promise.resolve(true));
    expect(await integrationStatus("pi")).toBe("installed");
    expect(invoke).toHaveBeenCalledWith("agent_pi_extension_status");
  });

  it("reads the string status of Codex", async () => {
    for (const [raw, status] of [
      ["upToDate", "installed"],
      ["notInstalled", "missing"],
      ["outdated", "missing"],
      ["malformed", "malformed"],
      ["unsafeToEdit", "uneditable"],
      ["unavailable", "unavailable"],
    ] as const) {
      invoke.mockImplementation(() => Promise.resolve(raw));
      expect(await integrationStatus("codex")).toBe(status);
    }
    expect(invoke).toHaveBeenCalledWith("agent_codex_status");
  });
});

describe("removeIntegration", () => {
  it("deletes the file and forgets only that agent", async () => {
    const { state, update } = fakeStore(["opencode", "omp"]);
    await removeIntegration("omp", update);
    expect(invoke).toHaveBeenCalledWith("agent_remove_integration", { agent: "omp" });
    expect(state.list).toEqual(["opencode"]);
  });

  it("removes Kex's Codex hooks and forgets codex", async () => {
    const { state, update } = fakeStore(["pi", "codex"]);
    await removeIntegration("codex", update);
    expect(invoke).toHaveBeenCalledWith("agent_remove_integration", { agent: "codex" });
    expect(state.list).toEqual(["pi"]);
  });

  it("keeps tracking the agent when the file could not be removed", async () => {
    invoke.mockImplementation(() => Promise.reject(new Error("not a Kex file")));
    const { state, update } = fakeStore(["omp"]);
    expect(await failureOf(() => removeIntegration("omp", update))).toContain("not a Kex file");
    expect(state.list).toEqual(["omp"]);
  });
});

describe("syncIntegrations", () => {
  it("does nothing when the user installed nothing", async () => {
    await syncIntegrations([], fakeStore().update);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks Rust to refresh the tracked agents and stops tracking the ones that are not Kex's", async () => {
    invoke.mockImplementation(() => Promise.resolve(["pi"]));
    const { state, update } = fakeStore(["omp", "pi"]);
    await syncIntegrations(["omp", "pi"], update);
    expect(invoke).toHaveBeenCalledWith("agent_sync_integrations", { agents: ["omp", "pi"] });
    expect(state.list).toEqual(["omp"]);
  });

  it("stops tracking codex when the sync reports it", async () => {
    invoke.mockImplementation(() => Promise.resolve(["codex"]));
    const { state, update } = fakeStore(["omp", "codex"]);
    await syncIntegrations(["omp", "codex"], update);
    expect(invoke).toHaveBeenCalledWith("agent_sync_integrations", { agents: ["omp", "codex"] });
    expect(state.list).toEqual(["omp"]);
  });

  it("leaves the stored list alone when everything was refreshed", async () => {
    invoke.mockImplementation(() => Promise.resolve([]));
    const { update } = fakeStore(["omp"]);
    await syncIntegrations(["omp"], update);
    expect(update).not.toHaveBeenCalled();
  });
});
