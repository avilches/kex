// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { createElement, type FunctionComponent, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (
    sel: (s: { shortcuts: Record<string, unknown> }) => unknown,
  ) => sel({ shortcuts: {} }),
}));
vi.mock("@/modules/theme", () => {
  const preview: { current: string | null } = { current: null };
  return {
    listBuiltinThemes: () => [],
    useTheme: () => ({
      themeId: "t",
      customThemes: [],
      setThemeId: () => {},
      previewThemeId: (id: string | null) => {
        preview.current = id;
      },
    }),
  };
});
vi.mock("@/modules/explorer/lib/iconResolver", () => ({
  fileIconUrl: () => "",
}));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({
  WorkspaceMark: () => null,
}));
vi.mock("./hooks/useCommandHistory", () => ({
  useCommandHistory: () => ({
    loading: false,
    error: null,
    results: [],
    retry: () => {},
  }),
}));

import { CommandPalette } from "./CommandPalette";

declare global {
  interface Window {
    __setOpen?: (v: boolean) => void;
  }
}

const noop = () => {};

const PaletteHarness: FunctionComponent<{
  initialMode?: "commands" | "content" | "history";
}> = ({ initialMode = "content" }) => {
  const [open, setOpen] = useState(true);
  window.__setOpen = setOpen;
  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      restoreFocus={() => {}}
      initialMode={initialMode}
      commandItems={[]}
      actionsWorkspace={null}
      onRunAction={noop}
      onStopAction={noop}
      onEditAction={noop}
      workspaceRoot={null}
      onOpenContentHit={noop}
      insertCommand={null}
      activeTabId={null}
      activeWorkspaceId="ws"
      tabEntries={[]}
      workspaceEntries={[]}
      closedEntries={[]}
      onSelectTab={noop}
      onSelectWorkspace={noop}
      onRunClosed={noop}
      onMoveActiveTabToWorkspace={noop}
      onTerminalTargetChange={noop}
      onOpenTerminalAt={noop}
      onCloseTab={noop}
      onCloseWorkspace={() => Promise.resolve(false)}
      onRenameWorkspace={noop}
      onHibernateWorkspace={noop}
      onCloseAllTabs={noop}
      onOpenWorkspaceSettings={noop}
    />
  );
}

async function settle(ms: number) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
  });
}

function inputEl(): HTMLInputElement {
  // cmdk overrides the id attribute the palette sets on its input, so the
  // input is reachable only through the cmdk marker selector.
  const el = document.querySelector<HTMLInputElement>('[cmdk-input=""]');
  if (!el) throw new Error("palette input not mounted");
  return el;
}

describe("palette focus", () => {
  afterEach(() => cleanup());

  it("takes the focus even while another cmdk input is still in the page, as the folder palette is when it closes for this one", async () => {
    const decoy = document.createElement("input");
    decoy.setAttribute("cmdk-input", "");
    document.body.prepend(decoy);
    try {
      render(createElement(PaletteHarness));
      await settle(30);
      const own = document.querySelector<HTMLInputElement>('[data-palette="command"]');
      expect(own).not.toBeNull();
      expect(document.activeElement).toBe(own);
      expect(document.activeElement).not.toBe(decoy);
    } finally {
      decoy.remove();
    }
  });
});

describe("palette history mode", () => {
  afterEach(() => cleanup());

  it("opens with the > sigil when the initial mode is history", async () => {
    render(createElement(PaletteHarness, { initialMode: "history" }));
    await settle(30);
    expect(inputEl().value).toBe(">");
  });
});

describe("palette select-all on reopen", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("selects the restored query text after close and reopen", async () => {
    render(createElement(PaletteHarness));
    await settle(30);
    const input = inputEl();

    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    const setVal = descriptor?.set;
    if (!setVal) throw new Error("value setter unavailable");
    await act(async () => {
      setVal.call(input, "#foo");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("#foo");

    // Esc: radix closes the non-modal dialog; capture happens on open false.
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await settle(30);

    // reopen via the shortcut path
    await act(async () => {
      window.__setOpen?.(true);
    });
    await settle(60);

    const reopened = inputEl();
    expect(reopened.value).toBe("#foo");
    // The restored term is selected but the leading # sigil stays out.
    expect([reopened.selectionStart, reopened.selectionEnd]).toEqual([1, 4]);
  });
});
