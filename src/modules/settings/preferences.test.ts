import { beforeEach, describe, expect, it, vi } from "vitest";

describe("usePreferencesStore.init", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keeps a change that arrives while the first load is reading the disk", async () => {
    let emit: ((key: string, value: unknown) => void) | undefined;
    let releaseLoad: (() => void) | undefined;
    vi.doMock("./store", async () => {
      const actual = await vi.importActual<typeof import("./store")>("./store");
      return {
        ...actual,
        onPreferencesChange: vi.fn(async (cb: (key: string, value: unknown) => void) => {
          emit = cb;
          return () => {};
        }),
        loadPreferences: vi.fn(async () => {
          const stale = { ...actual.DEFAULT_PREFERENCES, detectedEditors: [] };
          await new Promise<void>((resolve) => {
            releaseLoad = resolve;
          });
          return stale;
        }),
      };
    });
    const { usePreferencesStore } = await import("./preferences");
    const init = usePreferencesStore.getState().init();
    await vi.waitFor(() => expect(releaseLoad).toBeDefined());
    const fresh = [{ id: "claude" }];
    emit?.("detectedEditors", fresh);
    releaseLoad?.();
    await init;
    expect(usePreferencesStore.getState().detectedEditors).toEqual(fresh);
    emit?.("detectedEditors", []);
    expect(usePreferencesStore.getState().detectedEditors).toEqual([]);
  });
});
