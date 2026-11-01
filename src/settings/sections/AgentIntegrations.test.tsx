// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@/modules/settings/store", async (orig) => ({
  ...(await orig<typeof import("@/modules/settings/store")>()),
  updateInstalledIntegrations: () => Promise.resolve(),
  updateIntegrationSuggestions: () => Promise.resolve(),
  setAgentNotifications: () => Promise.resolve(),
}));
vi.mock("@/modules/settings/preferences", async (orig) => {
  const real = await orig<typeof import("@/modules/settings/preferences")>();
  return { ...real, whenHydrated: () => Promise.resolve() };
});
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { usePreferencesStore } from "@/modules/settings/preferences";
import { AgentIntegrations } from "./AgentIntegrations";

const status: Record<string, unknown> = {};

function detect(ids: string[]) {
  usePreferencesStore.setState({
    detectedEditors: ids.map((id) => ({ id, kind: "agent" })) as never,
  });
}

beforeEach(() => {
  invoke.mockReset();
  toast.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  for (const k of Object.keys(status)) delete status[k];
  Object.assign(status, {
    agent_claude_hooks_status: false,
    agent_codex_status: "notInstalled",
    agent_opencode_extension_status: false,
    agent_omp_extension_status: false,
    agent_pi_extension_status: false,
  });
  invoke.mockImplementation((cmd: string) => {
    if (cmd in status) return Promise.resolve(status[cmd]);
    return Promise.resolve(undefined);
  });
});

afterEach(cleanup);

describe("AgentIntegrations", () => {
  it("a not detected agent shows no Install button", async () => {
    detect([]);
    render(<AgentIntegrations />);
    expect((await screen.findAllByText("Not detected")).length).toBeGreaterThan(5);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("a detected agent without integration shows Install", async () => {
    detect(["claude"]);
    render(<AgentIntegrations />);
    expect(await screen.findByRole("button", { name: "Install" })).toBeTruthy();
  });

  it("detect-only agents show Detected and no buttons", async () => {
    detect(["goose", "aider"]);
    render(<AgentIntegrations />);
    expect((await screen.findAllByText("Detected")).length).toBe(2);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("Install all installs only missing detected agents and skips blocked ones", async () => {
    detect(["claude", "codex", "omp"]);
    status.agent_codex_status = "unavailable";
    render(<AgentIntegrations />);
    await screen.findByText("Not found");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install all" }));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), { timeout: 4000 });
    const called = invoke.mock.calls.map((c) => c[0]);
    expect(called).toContain("agent_enable_claude_hooks");
    expect(called).toContain("agent_setup_omp");
    expect(called).not.toContain("agent_setup_codex");
    expect(called).not.toContain("agent_setup_pi");
    expect(toast.success.mock.calls[0][0]).toMatch(/2 installed/);
  });

  it("Uninstall all asks for confirmation listing the agents before removing", async () => {
    detect(["claude", "omp"]);
    status.agent_claude_hooks_status = true;
    status.agent_omp_extension_status = true;
    render(<AgentIntegrations />);
    await screen.findAllByText("Installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Uninstall all" }));
    });
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Claude Code/)).toBeTruthy();
    expect(within(dialog).getByText(/OMP/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith("agent_remove_integration", expect.anything());
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Uninstall all" }));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), { timeout: 4000 });
    expect(invoke).toHaveBeenCalledWith("agent_disable_claude_hooks");
    expect(invoke).toHaveBeenCalledWith("agent_remove_integration", { agent: "omp" });
  });

  it("both bulk buttons are disabled when there is nothing to do", async () => {
    detect([]);
    render(<AgentIntegrations />);
    await screen.findAllByText("Not detected");
    expect((screen.getByRole("button", { name: "Install all" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Uninstall all" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
