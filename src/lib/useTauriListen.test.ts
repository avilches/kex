// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const listenMock = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

import { useTauriListen, useTauriUnlisten } from "./useTauriListen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(run: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    run();
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    unmount: () => act(() => root.unmount()),
  };
}

describe("useTauriListen", () => {
  it("subscribes via listen() and unlistens on unmount", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);
    const handler = vi.fn();

    const h = mount(() => useTauriListen("kex:test-event", handler));
    await act(async () => {
      await Promise.resolve();
    });

    expect(listenMock).toHaveBeenCalledWith("kex:test-event", handler);
    h.unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("unlistens immediately if listen() resolves after unmount, instead of leaking the listener", async () => {
    const unlisten = vi.fn();
    let resolveListen: ((fn: () => void) => void) | undefined;
    listenMock.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
    );

    const h = mount(() => useTauriListen("kex:test-event", vi.fn()));
    h.unmount();

    await act(async () => {
      resolveListen?.(unlisten);
      await Promise.resolve();
    });

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("useTauriUnlisten", () => {
  it("calls the factory once and unlistens on unmount", async () => {
    const unlisten = vi.fn();
    const factory = vi.fn().mockResolvedValue(unlisten);

    const h = mount(() => useTauriUnlisten(factory));
    await act(async () => {
      await Promise.resolve();
    });

    expect(factory).toHaveBeenCalledTimes(1);
    h.unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("unlistens immediately if the factory resolves after unmount", async () => {
    const unlisten = vi.fn();
    let resolveFactory: ((fn: () => void) => void) | undefined;
    const factory = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveFactory = resolve;
        }),
    );

    const h = mount(() => useTauriUnlisten(factory));
    h.unmount();

    await act(async () => {
      resolveFactory?.(unlisten);
      await Promise.resolve();
    });

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
