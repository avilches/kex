// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writeClipboardText = vi.fn((_value: string) => Promise.resolve(true));
vi.mock("@/lib/clipboard", () => ({ writeClipboardText: (v: string) => writeClipboardText(v) }));

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { SidebarTabMenuProvider, type SidebarTabMenuActions } from "./SidebarTabMenuContext";
import { TabCopyPathItems } from "./TabCopyPathItems";
import type { Tab } from "./lib/types";

const noop = () => {};

function open(tab: Tab, root: string | null = "/repo") {
  const actions: SidebarTabMenuActions = {
    paneTabCount: () => 1,
    onClose: noop,
    onCloseOtherTabs: noop,
    onRenameTab: noop,
    onUpdateTab: noop,
    onSaveTab: noop,
    onRevealInExplorer: noop,
    workspaceRoot: () => root,
  };
  render(
    <SidebarTabMenuProvider value={actions}>
      <ContextMenu>
        <ContextMenuTrigger>target</ContextMenuTrigger>
        <ContextMenuContent>
          <TabCopyPathItems tab={tab} workspaceId="ws-1" />
        </ContextMenuContent>
      </ContextMenu>
    </SidebarTabMenuProvider>,
  );
  act(() => {
    fireEvent.contextMenu(screen.getByText("target"));
  });
}

beforeEach(() => {
  writeClipboardText.mockClear();
  useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
});
afterEach(cleanup);

describe("TabCopyPathItems", () => {
  it("offers the absolute and relative path of a terminal folder", async () => {
    open({ id: "t1", kind: "terminal", cwd: "/repo/src" });

    expect(screen.getByText("Copy Absolute Path")).toBeTruthy();
    expect(screen.getByText("Copy Relative Path")).toBeTruthy();
    expect(screen.getByText("/repo/src")).toBeTruthy();
    expect(screen.getByText("src")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Relative Path"));
    });
    expect(writeClipboardText).toHaveBeenCalledWith("src");
  });

  it("follows the worktree the agent entered", async () => {
    useAgentStore.getState().startIdle("t1", "ws-1", "claude");
    useAgentStore.getState().setMeta("t1", { worktreeCwd: "/repo/.claude/worktrees/x" });
    open({ id: "t1", kind: "terminal", cwd: "/repo" });

    await act(async () => {
      fireEvent.click(screen.getByText("Copy Absolute Path"));
    });
    expect(writeClipboardText).toHaveBeenCalledWith("/repo/.claude/worktrees/x");
  });

  it("copies the file of an editor tab", async () => {
    open({ id: "e1", kind: "editor", path: "/repo/a/b.ts", dirty: false, preview: false });

    await act(async () => {
      fireEvent.click(screen.getByText("Copy Absolute Path"));
    });
    expect(writeClipboardText).toHaveBeenCalledWith("/repo/a/b.ts");
  });

  it("disables the relative path when the workspace has no root", () => {
    open({ id: "t1", kind: "terminal", cwd: "/repo" }, null);

    expect(screen.getByText("No workspace root")).toBeTruthy();
  });

  it("renders nothing for a tab without a path", () => {
    open({ id: "b1", kind: "browser", url: "https://a.b" } as Tab);

    expect(screen.queryByText("Copy Absolute Path")).toBeNull();
  });
});
