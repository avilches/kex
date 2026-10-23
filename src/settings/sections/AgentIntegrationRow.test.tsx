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

let windows = false;
vi.mock("@/lib/platform", async (orig) => ({
  ...(await orig<typeof import("@/lib/platform")>()),
  get IS_WINDOWS() {
    return windows;
  },
}));

import { useIntegration } from "@/modules/agents/lib/useIntegration";
import { AgentIntegrationRow } from "./AgentIntegrationRow";

let installed = false;
let codexStatus = "notInstalled";

function CodexRow() {
  const state = useIntegration("codex");
  return (
    <AgentIntegrationRow
      agent="codex"
      name="Codex"
      files={["~/.codex/hooks.json", "~/.codex/config.toml"]}
      state={state}
    />
  );
}

function Row() {
  const state = useIntegration("omp");
  return <AgentIntegrationRow agent="omp" name="OMP" files={["~/.omp/x.ts"]} state={state} />;
}

beforeEach(() => {
  installed = false;
  codexStatus = "notInstalled";
  stored = [];
  invoke.mockClear();
  setInstalled.mockClear();
  invoke.mockImplementation((cmd: string, args?: unknown) => {
    if (cmd === "agent_omp_extension_status") return Promise.resolve(installed);
    if (cmd === "agent_codex_status") return Promise.resolve(codexStatus);
    if (cmd === "agent_setup_codex") {
      codexStatus = "upToDate";
      return Promise.resolve(undefined);
    }
    if (cmd === "agent_setup_omp") {
      installed = true;
      return Promise.resolve(undefined);
    }
    if (cmd === "agent_remove_integration") {
      installed = false;
      return Promise.resolve(undefined);
    }
    if (cmd === "agent_integration_preview" && (args as { agent: string }).agent === "codex") {
      return Promise.resolve([
        {
          path: "~/.codex/hooks.json",
          before: "{}\n",
          after: '{"hooks":{}}\n',
          note: "hooks.json is rewritten with standard JSON formatting.",
        },
        { path: "~/.codex/config.toml", before: null, after: "[hooks.state]\n" },
      ]);
    }
    if (cmd === "agent_integration_preview") {
      return Promise.resolve([
        { path: "~/.omp/x.ts", before: null, after: "// kex-agent-status-v2\nexport {}\n" },
      ]);
    }
    return Promise.resolve(undefined);
  });
});

afterEach(cleanup);

describe("AgentIntegrationRow", () => {
  it("offers Install and no Uninstall while the integration is missing", async () => {
    render(<Row />);
    expect(await screen.findByText("Not installed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();
  });

  it("installs, remembers the agent and then offers Uninstall", async () => {
    render(<Row />);
    await screen.findByText("Not installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    await screen.findByText("Installed");
    expect(invoke).toHaveBeenCalledWith("agent_setup_omp");
    expect(setInstalled).toHaveBeenCalledWith(["omp"]);
    expect(screen.getByRole("button", { name: "Uninstall" })).toBeTruthy();
  });

  it("uninstalls the file and forgets the agent", async () => {
    installed = true;
    stored = ["omp", "pi"];
    render(<Row />);
    await screen.findByText("Installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
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
    render(<Row />);
    await screen.findByText("Not installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    await waitFor(() => expect(screen.getByText(/Could not change the OMP integration/)).toBeTruthy());
    expect(setInstalled).not.toHaveBeenCalled();
    expect(screen.getByText("Not installed")).toBeTruthy();
  });

  it("View changes shows the dry run without writing and installs from the dialog", async () => {
    render(<Row />);
    await screen.findByText("Not installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "View changes" }));
    });
    expect(await screen.findByText("+ export {}")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("agent_integration_preview", {
      agent: "omp",
      install: true,
    });
    expect(invoke).not.toHaveBeenCalledWith("agent_setup_omp");

    const confirm = screen
      .getAllByRole("button", { name: "Install" })
      .find((b) => b.closest("[role=dialog]"));
    await act(async () => {
      fireEvent.click(confirm!);
    });
    await screen.findByText("Installed");
    expect(invoke).toHaveBeenCalledWith("agent_setup_omp");
  });

  it("reads the Codex string status and installs Codex", async () => {
    render(<CodexRow />);
    expect(await screen.findByText("Not installed")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    await screen.findByText("Installed");
    expect(invoke).toHaveBeenCalledWith("agent_setup_codex");
    expect(setInstalled).toHaveBeenCalledWith(["codex"]);
  });

  it("offers Install again when the Codex install is outdated", async () => {
    codexStatus = "outdated";
    render(<CodexRow />);
    expect(await screen.findByText("Not installed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
  });

  it("explains a Codex config it cannot parse and offers neither Install nor the preview", async () => {
    codexStatus = "malformed";
    render(<CodexRow />);
    expect(await screen.findByText("Cannot read config")).toBeTruthy();
    expect(screen.getByText(/cannot parse ~\/\.codex\/hooks\.json or ~\/\.codex\/config\.toml/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();
    expect((screen.getByRole("button", { name: "View changes" }) as HTMLButtonElement).disabled).toBe(true);

    codexStatus = "upToDate";
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    });
    await screen.findByText("Installed");
    expect(screen.getByRole("button", { name: "Uninstall" })).toBeTruthy();
  });

  it("says Codex is missing when its folder does not exist", async () => {
    codexStatus = "unavailable";
    render(<CodexRow />);
    expect(await screen.findByText("Not found")).toBeTruthy();
    expect(screen.getByText(/Install Codex and run it once/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("on Windows says the Codex integration is not supported instead of a missing folder", async () => {
    codexStatus = "unavailable";
    windows = true;
    try {
      render(<CodexRow />);
      expect(await screen.findByText("Not supported")).toBeTruthy();
      expect(screen.getByText(/not supported on Windows yet/)).toBeTruthy();
      expect(screen.queryByText(/folder does not exist/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    } finally {
      windows = false;
    }
  });

  it("previews both Codex files with the note of the reformatted one", async () => {
    render(<CodexRow />);
    await screen.findByText("Not installed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "View changes" }));
    });
    expect(
      await screen.findByText("hooks.json is rewritten with standard JSON formatting."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "~/.codex/hooks.json" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "~/.codex/config.toml" }));
    });
    expect(await screen.findByText("+ [hooks.state]")).toBeTruthy();
    expect(screen.queryByText("hooks.json is rewritten with standard JSON formatting.")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("agent_setup_codex");
  });
});
