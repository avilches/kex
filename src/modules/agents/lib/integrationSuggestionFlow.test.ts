import { describe, expect, it, vi } from "vitest";
import { createIntegrationSuggester, type SuggestDeps } from "./integrationSuggestionFlow";
import { SUGGESTION_RETRY_MS, type SuggestionMap } from "./integrationSuggestion";

const T0 = 1_700_000_000_000;

function setup(opts: { installed?: boolean; map?: SuggestionMap; now?: number } = {}) {
  const state = { map: opts.map ?? ({} as SuggestionMap), now: opts.now ?? T0 };
  const show = vi.fn();
  const deps: SuggestDeps = {
    now: () => state.now,
    status: async () => opts.installed ?? false,
    read: async () => state.map,
    update: async (change) => {
      state.map = change(state.map);
    },
    show,
  };
  return { state, show, suggest: createIntegrationSuggester(deps) };
}

describe("integration suggester", () => {
  it("shows the toast the first time an agent without integration is seen", async () => {
    const { suggest, show, state } = setup();
    await suggest("claude");
    expect(show).toHaveBeenCalledWith("claude");
    expect(state.map.claude).toEqual({ asks: 1, lastAskedAt: T0, installedOnce: false });
  });

  it("ignores agents that have no integration", async () => {
    const { suggest, show } = setup();
    await suggest("codex");
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
    const { suggest, show, state } = setup({ installed: true });
    await suggest("omp");
    expect(show).not.toHaveBeenCalled();
    expect(state.map.omp?.installedOnce).toBe(true);
  });

  it("does not ask again within 15 days of the first ask", async () => {
    const { suggest, show } = setup({
      map: { claude: { asks: 1, lastAskedAt: T0, installedOnce: false } },
      now: T0 + SUGGESTION_RETRY_MS - 1,
    });
    await suggest("claude");
    expect(show).not.toHaveBeenCalled();
  });

  it("asks a second and last time after 15 days", async () => {
    const { suggest, show, state } = setup({
      map: { claude: { asks: 1, lastAskedAt: T0, installedOnce: false } },
      now: T0 + SUGGESTION_RETRY_MS,
    });
    await suggest("claude");
    expect(show).toHaveBeenCalledTimes(1);
    expect(state.map.claude?.asks).toBe(2);

    state.now = T0 + SUGGESTION_RETRY_MS * 5;
    const later = createIntegrationSuggester({
      now: () => state.now,
      status: async () => false,
      read: async () => state.map,
      update: async (change) => {
        state.map = change(state.map);
      },
      show,
    });
    await later("claude");
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("never asks about an integration that was installed once and removed", async () => {
    const { suggest, show } = setup({
      map: { pi: { asks: 0, lastAskedAt: null, installedOnce: true } },
    });
    await suggest("pi");
    expect(show).not.toHaveBeenCalled();
  });

  it("keeps quiet and does not throw when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const show = vi.fn();
    const suggest = createIntegrationSuggester({
      now: () => T0,
      status: async () => false,
      read: async () => {
        throw new Error("store gone");
      },
      update: async () => {},
      show,
    });
    await expect(suggest("claude")).resolves.toBeUndefined();
    expect(show).not.toHaveBeenCalled();
  });
});
