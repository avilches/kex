import { describe, expect, it, vi } from "vitest";
import { createIntegrationSuggester, type SuggestDeps } from "./integrationSuggestionFlow";
import { SUGGESTION_RETRY_MS, type SuggestionMap } from "./integrationSuggestion";
import type { IntegrationStatus } from "./integrations";

const T0 = 1_700_000_000_000;

function setup(opts: { status?: IntegrationStatus; map?: SuggestionMap; now?: number } = {}) {
  const state = { map: opts.map ?? ({} as SuggestionMap), now: opts.now ?? T0 };
  const show = vi.fn();
  const warn = vi.fn();
  const deps: SuggestDeps = {
    now: () => state.now,
    status: async () => opts.status ?? "missing",
    read: async () => state.map,
    update: async (change) => {
      state.map = change(state.map);
    },
    show,
    warn,
  };
  const raw = createIntegrationSuggester(deps);
  return { state, show, warn, suggest: (agent: unknown, tabId = "tab-1") => raw(agent, tabId) };
}

describe("integration suggester", () => {
  it("shows the toast the first time an agent without integration is seen", async () => {
    const { suggest, show, state } = setup();
    await suggest("claude");
    expect(show).toHaveBeenCalledWith("claude");
    expect(state.map.claude).toEqual({ asks: 1, lastAskedAt: T0, installedOnce: false, markerDismissed: false });
  });

  it("ignores agents that have no integration", async () => {
    const { suggest, show } = setup();
    await suggest("gemini");
    await suggest(null);
    expect(show).not.toHaveBeenCalled();
  });

  it("asks once per app run even when many tabs start the agent", async () => {
    const { suggest, show } = setup();
    await Promise.all([suggest("pi"), suggest("pi")]);
    await suggest("pi");
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("remembers an agent that is already installed and stays silent", async () => {
    const { suggest, show, state } = setup({ status: "installed" });
    await suggest("omp");
    expect(show).not.toHaveBeenCalled();
    expect(state.map.omp?.installedOnce).toBe(true);
  });

  it("suggests Codex like the other agents when its hooks are missing", async () => {
    const { suggest, show } = setup();
    await suggest("codex");
    expect(show).toHaveBeenCalledWith("codex");
  });

  it("does not ask nor count an ask while Install could not work", async () => {
    for (const status of ["malformed", "uneditable", "unavailable"] as const) {
      const { suggest, show, state } = setup({ status });
      await suggest("codex");
      expect(show).not.toHaveBeenCalled();
      expect(state.map).toEqual({});
    }
  });

  it("does not ask again within 15 days of the first ask", async () => {
    const { suggest, show } = setup({
      map: { claude: { asks: 1, lastAskedAt: T0, installedOnce: false, markerDismissed: false } },
      now: T0 + SUGGESTION_RETRY_MS - 1,
    });
    await suggest("claude");
    expect(show).not.toHaveBeenCalled();
  });

  it("asks a second and last time after 15 days", async () => {
    const { suggest, show, state } = setup({
      map: { claude: { asks: 1, lastAskedAt: T0, installedOnce: false, markerDismissed: false } },
      now: T0 + SUGGESTION_RETRY_MS,
    });
    await suggest("claude");
    expect(show).toHaveBeenCalledTimes(1);
    expect(state.map.claude?.asks).toBe(2);

    state.now = T0 + SUGGESTION_RETRY_MS * 5;
    const later = createIntegrationSuggester({
      now: () => state.now,
      status: async () => "missing",
      read: async () => state.map,
      update: async (change) => {
        state.map = change(state.map);
      },
      show,
      warn: vi.fn(),
    });
    await later("claude", "tab-1");
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("never asks about an integration that was installed once and removed", async () => {
    const { suggest, show } = setup({
      map: { pi: { asks: 0, lastAskedAt: null, installedOnce: true, markerDismissed: false } },
    });
    await suggest("pi");
    expect(show).not.toHaveBeenCalled();
  });

  it("keeps quiet and does not throw when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const show = vi.fn();
    const suggest = createIntegrationSuggester({
      now: () => T0,
      status: async () => "missing",
      read: async () => {
        throw new Error("store gone");
      },
      update: async () => {},
      show,
      warn: vi.fn(),
    });
    await expect(suggest("claude", "tab-1")).resolves.toBeUndefined();
    expect(show).not.toHaveBeenCalled();
  });

  it("marks every tab that runs the agent without integration, but toasts once", async () => {
    const { suggest, show, warn } = setup();
    await suggest("claude", "tab-1");
    await suggest("claude", "tab-2");
    expect(warn).toHaveBeenCalledWith("tab-1", "claude");
    expect(warn).toHaveBeenCalledWith("tab-2", "claude");
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("marks the tab even when the ask policy keeps the toast quiet", async () => {
    const { suggest, show, warn } = setup({
      map: { claude: { asks: 2, lastAskedAt: T0, installedOnce: false, markerDismissed: false } },
    });
    await suggest("claude");
    expect(show).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("tab-1", "claude");
  });

  it("does not mark a tab whose agent is installed or cannot be installed", async () => {
    for (const status of ["installed", "malformed", "unavailable"] as const) {
      const { suggest, warn } = setup({ status });
      await suggest("claude");
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it("never marks a tab for an agent whose marker was dismissed, and still toasts by policy", async () => {
    const { suggest, show, warn } = setup({
      map: { claude: { asks: 0, lastAskedAt: null, installedOnce: false, markerDismissed: true } },
    });
    await suggest("claude");
    expect(warn).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledTimes(1);
  });
});
