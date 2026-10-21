// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startProfiler = vi.fn();
const stopProfiler = vi.fn();
vi.mock("./profiler", () => ({ startProfiler, stopProfiler }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main-2" }) }));

const { usePreferencesStore } = await import("@/modules/settings/preferences");
const { DEFAULT_PREFERENCES } = await import("@/modules/settings/store");
const { useProfilerSetting } = await import("./useProfilerSetting");

describe("useProfilerSetting", () => {
  beforeEach(() => {
    startProfiler.mockClear();
    stopProfiler.mockClear();
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES });
  });

  afterEach(cleanup);

  it("does nothing while the setting is off", () => {
    renderHook(() => useProfilerSetting());
    expect(startProfiler).not.toHaveBeenCalled();
  });

  it("starts with the window label when the setting is on at mount", () => {
    usePreferencesStore.setState({ performanceProfiler: true });
    renderHook(() => useProfilerSetting());
    expect(startProfiler).toHaveBeenCalledWith("main-2");
  });

  it("follows the setting while mounted and stops on unmount", async () => {
    const { unmount } = renderHook(() => useProfilerSetting());
    await act(async () => usePreferencesStore.setState({ performanceProfiler: true }));
    expect(startProfiler).toHaveBeenCalledTimes(1);
    await act(async () => usePreferencesStore.setState({ performanceProfiler: false }));
    expect(stopProfiler).toHaveBeenCalledTimes(1);
    await act(async () => usePreferencesStore.setState({ performanceProfiler: true }));
    expect(startProfiler).toHaveBeenCalledTimes(2);
    unmount();
    expect(stopProfiler).toHaveBeenCalledTimes(2);
  });
});
