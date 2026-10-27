// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE_INPUT_SELECTOR } from "@/modules/command-palette/lib/keepPaletteFocus";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { HibernateDialog } from "./HibernateDialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({}) }));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({ WorkspaceMark: () => null }));

afterEach(cleanup);

const workspace = {
  id: "ws-1",
  title: "W",
  activePaneId: "pane-1",
  paneTree: {
    kind: "pane",
    id: "pane-1",
    activeTabId: "tab-1",
    tabs: [{ id: "tab-1", kind: "editor", path: "/p/a.ts", dirty: true }],
  },
} as unknown as Workspace;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

function Dialog({ open }: { open: boolean }) {
  return (
    <>
      <input cmdk-input="" data-palette="command" data-testid="palette-input" />
      <HibernateDialog
        workspace={open ? workspace : null}
        tabIds={["tab-1"]}
        onClose={() => {}}
        onHibernate={() => {}}
        onSaveTab={async () => null}
        onGoToTab={() => {}}
        onEnableRunOnStart={() => {}}
        onStopBusy={() => {}}
      />
    </>
  );
}

async function openAndClose(close: () => void) {
  const view = render(<Dialog open={false} />);
  const input = view.getByTestId("palette-input") as HTMLInputElement;
  expect(document.querySelector(PALETTE_INPUT_SELECTOR)).toBe(input);
  input.focus();
  view.rerender(<Dialog open />);
  await wait(50);
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(document.activeElement).not.toBe(input);
  close();
  view.rerender(<Dialog open={false} />);
  await wait(400);
  return input;
}

describe("HibernateDialog over the command palette", () => {
  it("gives the focus back to the palette input when confirmed", async () => {
    const input = await openAndClose(() => {});
    expect(document.activeElement).toBe(input);
  });

  it("gives it back after Cancel", async () => {
    const input = await openAndClose(() => fireEvent.click(screen.getByText("Close")));
    expect(document.activeElement).toBe(input);
  });

  it("gives it back after Escape", async () => {
    const input = await openAndClose(() =>
      fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" }),
    );
    expect(document.activeElement).toBe(input);
  });
});
