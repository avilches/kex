// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ ask: vi.fn<() => Promise<{ holder: string | null }>>() }));
vi.mock("@/lib/native", () => ({
  native: { onboardingBlockHolder: () => holder.ask() },
}));

const bus = vi.hoisted(() => ({
  handlers: new Set<(e: { payload: { holder: string | null } }) => void>(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (_name: string, cb: (e: { payload: { holder: string | null } }) => void) => {
    bus.handlers.add(cb);
    return Promise.resolve(() => bus.handlers.delete(cb));
  },
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "w-me" }),
}));

import { useOnboardingBusy } from "./useOnboardingBusy";

const announce = (h: string | null) => bus.handlers.forEach((cb) => cb({ payload: { holder: h } }));
const settle = () => act(async () => {});

beforeEach(() => {
  bus.handlers.clear();
  holder.ask.mockReset().mockResolvedValue({ holder: null });
});
afterEach(cleanup);

describe("useOnboardingBusy", () => {
  it("starts idle when no window holds the dialog", async () => {
    const { result } = renderHook(() => useOnboardingBusy());
    await settle();
    expect(result.current).toBe(false);
  });

  it("is busy when another window opens its dialog, and idle again when it closes", async () => {
    const { result } = renderHook(() => useOnboardingBusy());
    await settle();
    act(() => announce("w-other"));
    expect(result.current).toBe(true);
    act(() => announce(null));
    expect(result.current).toBe(false);
  });

  it("stays idle for the window that holds the dialog itself", async () => {
    const { result } = renderHook(() => useOnboardingBusy());
    await settle();
    act(() => announce("w-me"));
    expect(result.current).toBe(false);
  });

  it("is busy at once when it opens while another window already holds the dialog", async () => {
    holder.ask.mockResolvedValue({ holder: "w-other" });
    const { result } = renderHook(() => useOnboardingBusy());
    await settle();
    expect(result.current).toBe(true);
  });

  it("lets an event that lands during the first ask win over its older answer", async () => {
    let answer: (v: { holder: string | null }) => void = () => {};
    holder.ask.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useOnboardingBusy());
    await settle();
    act(() => announce(null));
    await act(async () => answer({ holder: "w-other" }));
    expect(result.current).toBe(false);
  });

  it("stops listening once unmounted", async () => {
    const { unmount } = renderHook(() => useOnboardingBusy());
    await settle();
    expect(bus.handlers.size).toBe(1);
    unmount();
    await settle();
    expect(bus.handlers.size).toBe(0);
  });
});
