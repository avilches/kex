import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  installAgent: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/modules/agents/lib/agentIntegration", async (orig) => ({
  ...(await orig<typeof import("@/modules/agents/lib/agentIntegration")>()),
  installAgent: (...a: unknown[]) => h.installAgent(...a),
}));

import { AgentNotDetectedError } from "@/modules/agents/lib/agentIntegration";
import { installWithToast } from "./IntegrationSuggestionToast";

beforeEach(() => {
  h.toast.mockReset();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.installAgent.mockReset();
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
