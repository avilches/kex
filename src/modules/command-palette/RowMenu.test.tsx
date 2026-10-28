// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { moveMenuItems, type RowMenuItem } from "./lib/rowMenu";
import { digitLabel, RowMenu, useRowMenu } from "./RowMenu";

vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (sel: (s: { shortcuts: object }) => unknown) => sel({ shortcuts: {} }),
}));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({
  WorkspaceMark: ({ id }: { id: string }) => <i data-ws-mark={id} />,
}));

afterEach(cleanup);

const anchor = { rowTop: 0, rowBottom: 10 };
const root: RowMenuItem[] = [
  { id: "go", label: "Go to Tab" },
  { id: "moveWorkspace", label: "Move to Workspace" },
];
const targets = [
  { workspaceId: "a", title: "Alpha", color: null, icon: null },
  { workspaceId: "b", title: "Beta", color: null, icon: null },
];

function openMove() {
  const hook = renderHook(() => useRowMenu());
  act(() => hook.result.current.open("tab:t", root, anchor));
  act(() => hook.result.current.enter(moveMenuItems(targets, "x"), "moveWorkspace"));
  return hook.result;
}

describe("the move level of the row menu", () => {
  it("draws a WorkspaceMark and the digit on every destination, none on Back", () => {
    const result = openMove();
    const { container } = render(
      <RowMenu menu={result.current.menu as never} onRun={() => {}} onActive={() => {}} />,
    );
    const rows = [...container.querySelectorAll('[role="menuitem"]')];
    expect(rows.map((r) => r.textContent)).toEqual([
      "Back",
      "New workspace",
      `Alpha${digitLabel({}, 1)}`,
      `Beta${digitLabel({}, 2)}`,
    ]);
    expect(rows[2].querySelector('[data-ws-mark="a"]')).not.toBeNull();
    expect(rows[0].querySelector("[data-ws-mark]")).toBeNull();
  });

  it("Back restores the root items with the opener active, and root has no parent", () => {
    const result = openMove();
    expect(result.current.menu?.parent).toBeDefined();
    act(() => result.current.back());
    expect(result.current.menu?.items).toEqual(root);
    expect(result.current.menu?.items[result.current.menu.active].id).toBe("moveWorkspace");
    expect(result.current.menu?.parent).toBeUndefined();
  });

  it("Escape in the submenu goes back and in the root menu closes it", () => {
    const result = openMove();
    const esc = () => act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    esc();
    expect(result.current.menu?.items).toEqual(root);
    esc();
    expect(result.current.menu).toBeNull();
  });

  it("keeps the parent items fresh when a toggle flips while in the submenu", () => {
    const result = openMove();
    const next: RowMenuItem[] = [...root, { id: "lock", label: "Lock" }];
    act(() => result.current.setItems(next));
    expect(result.current.menu?.items[0].id).toBe("back");
    act(() => result.current.back());
    expect(result.current.menu?.items).toEqual(next);
  });
});
