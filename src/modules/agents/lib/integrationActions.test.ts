import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import type { IntegrationAgent } from "./integrations";
import { installIntegration, removeIntegration, syncIntegrations } from "./integrationActions";

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

describe("removeIntegration", () => {
  it("deletes the file and forgets only that agent", async () => {
    const { state, update } = fakeStore(["opencode", "omp"]);
    await removeIntegration("omp", update);
    expect(invoke).toHaveBeenCalledWith("agent_remove_integration", { agent: "omp" });
    expect(state.list).toEqual(["opencode"]);
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

  it("leaves the stored list alone when everything was refreshed", async () => {
    invoke.mockImplementation(() => Promise.resolve([]));
    const { update } = fakeStore(["omp"]);
    await syncIntegrations(["omp"], update);
    expect(update).not.toHaveBeenCalled();
  });
});
