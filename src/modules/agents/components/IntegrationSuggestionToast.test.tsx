import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  installAgent: vi.fn(),
  agentStatus: vi.fn(),
  update: vi.fn(),
  hydration: { promise: Promise.resolve(), resolve: () => {} },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/modules/agents/lib/agentIntegration", async (orig) => ({
  ...(await orig<typeof import("@/modules/agents/lib/agentIntegration")>()),
  installAgent: (...a: unknown[]) => h.installAgent(...a),
  agentStatus: (...a: unknown[]) => h.agentStatus(...a),
}));
vi.mock("@/modules/settings/preferences", async (orig) => ({
  ...(await orig<typeof import("@/modules/settings/preferences")>()),
  whenHydrated: () => h.hydration.promise,
}));
vi.mock("@/modules/settings/store", async (orig) => ({
  ...(await orig<typeof import("@/modules/settings/store")>()),
  readIntegrationSuggestions: () => Promise.resolve({}),
  updateIntegrationSuggestions: (...a: unknown[]) => h.update(...a),
}));

import { AgentNotDetectedError } from "@/modules/agents/lib/agentIntegration";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { installWithToast, suggestIntegration } from "./IntegrationSuggestionToast";

function pendingHydration() {
  h.hydration.promise = new Promise<void>((r) => {
    h.hydration.resolve = r;
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  h.toast.mockReset();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.installAgent.mockReset();
  h.agentStatus.mockReset();
  h.agentStatus.mockResolvedValue("missing");
  h.update.mockReset();
  h.update.mockResolvedValue(undefined);
  h.hydration.promise = Promise.resolve();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("installWithToast", () => {
  it("says the agent was not found when the install path cannot find it", async () => {
    h.installAgent.mockRejectedValue(new AgentNotDetectedError("pi"));
    await installWithToast("pi");
    expect(h.toast.error).toHaveBeenCalledWith("Pi was not found on this machine");
  });

  it("keeps the generic text for any other failure", async () => {
    h.installAgent.mockRejectedValue(new Error("EACCES"));
    await installWithToast("omp");
    expect(h.toast.error).toHaveBeenCalledWith("Could not install the OMP integration");
  });
});

describe("suggestIntegration before hydration", () => {
  it("waits for the stored onboarding state and stays quiet while it is unfinished", async () => {
    pendingHydration();
    usePreferencesStore.setState({
      onboarding: { finished: true, step: "welcome", shown: true, reminded: true },
    });
    const run = suggestIntegration("codex");
    await flush();
    expect(h.agentStatus).not.toHaveBeenCalled();

    usePreferencesStore.setState({
      onboarding: { finished: false, step: "agents", shown: true, reminded: false },
    });
    h.hydration.resolve();
    await run;
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("suggests normally once hydrated with the onboarding finished", async () => {
    usePreferencesStore.setState({
      onboarding: { finished: true, step: "done", shown: true, reminded: true },
    });
    await suggestIntegration("codex");
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0]).toBe("Codex is running without the Kex integration");
  });
});
