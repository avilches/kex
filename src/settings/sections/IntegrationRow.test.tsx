// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
let stored: string[] = [];
const setInstalled = vi.fn((_agents: string[]) => Promise.resolve());
vi.mock("@/modules/settings/store", async (orig) => ({
  ...(await orig<typeof import("@/modules/settings/store")>()),
  updateInstalledIntegrations: (change: (c: string[]) => string[]) => {
    stored = change(stored);
    return setInstalled(stored);
  },
}));

import { IntegrationRow } from "./IntegrationRow";

let installed = false;

beforeEach(() => {
  installed = false;
  stored = [];
  invoke.mockClear();
  setInstalled.mockClear();
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "agent_omp_extension_status") return Promise.resolve(installed);
    if (cmd === "agent_setup_omp") {
      installed = true;
      return Promise.resolve(undefined);
    }
    if (cmd === "agent_remove_integration") {
      installed = false;
      return Promise.resolve(undefined);
    }
    return Promise.resolve(undefined);
  });
});

afterEach(cleanup);

function row() {
  render(<IntegrationRow agent="omp" name="OMP" kind="extension" file="~/.omp/x.ts" />);
}

describe("IntegrationRow", () => {
  it("offers Install and no Remove while the integration is missing", async () => {
    row();
    expect(await screen.findByText("Not installed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("installs, remembers the agent and then offers Reinstall and Remove", async () => {
    row();
    await screen.findByText("Not installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    await screen.findByText("Installed");
    expect(invoke).toHaveBeenCalledWith("agent_setup_omp");
    expect(setInstalled).toHaveBeenCalledWith(["omp"]);
    expect(screen.getByRole("button", { name: "Reinstall" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("removes the file and forgets the agent", async () => {
    installed = true;
    stored = ["omp", "pi"];
    row();
    await screen.findByText("Installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    });
    await screen.findByText("Not installed");
    expect(invoke).toHaveBeenCalledWith("agent_remove_integration", { agent: "omp" });
    expect(setInstalled).toHaveBeenCalledWith(["pi"]);
  });

  it("shows an error and keeps the state when the write fails", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "agent_omp_extension_status") return Promise.resolve(false);
      return Promise.reject(new Error("read-only folder"));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    row();
    await screen.findByText("Not installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    await waitFor(() => expect(screen.getByText(/Could not change the OMP extension/)).toBeTruthy());
    expect(setInstalled).not.toHaveBeenCalled();
    expect(screen.getByText("Not installed")).toBeTruthy();
  });
});
