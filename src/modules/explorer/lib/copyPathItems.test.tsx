// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const copyToClipboard = vi.fn((_text: string, _label?: string) => Promise.resolve(true));
vi.mock("./contextActions", () => ({
  copyToClipboard: (text: string, label?: string) => copyToClipboard(text, label),
}));

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  CopyAbsolutePathItem,
  CopyRelativePathItem,
  CopyRelativeTextItem,
} from "./copyPathItems";

function open() {
  render(
    <ContextMenu>
      <ContextMenuTrigger>target</ContextMenuTrigger>
      <ContextMenuContent>
        <CopyRelativeTextItem text="src/a/b.ts" />
        <CopyAbsolutePathItem path="/ws/src/a/b.ts" />
      </ContextMenuContent>
    </ContextMenu>,
  );
  act(() => {
    fireEvent.contextMenu(screen.getByText("target"));
  });
}

function openAtWorkspaceRoot() {
  render(
    <ContextMenu>
      <ContextMenuTrigger>target</ContextMenuTrigger>
      <ContextMenuContent>
        <CopyRelativeTextItem text="." />
        <CopyRelativePathItem path="/ws" workspaceRoot="/ws" />
      </ContextMenuContent>
    </ContextMenu>,
  );
  act(() => {
    fireEvent.contextMenu(screen.getByText("target"));
  });
}

describe("copy path items", () => {
  afterEach(() => {
    cleanup();
    copyToClipboard.mockClear();
  });

  it("shows the text each entry copies, muted, below its label", () => {
    open();
    expect(screen.getByText("src/a/b.ts").closest("[title]")?.className).toContain("text-muted-foreground");
    expect(screen.getByText("/ws/src/a/b.ts").closest("[title]")?.className).toContain("text-muted-foreground");
  });

  it("keeps a short path left aligned with no ellipsis", () => {
    open();
    const box = screen.getByText("/ws/src/a/b.ts").parentElement!;
    expect(box.getAttribute("dir")).toBe("rtl");
    expect(box.className).toContain("overflow-hidden");
    expect(box.className).toContain("text-left");
    expect(screen.getByText("/ws/src/a/b.ts").getAttribute("dir")).toBe("ltr");
    expect(screen.queryByText("…")).toBeNull();
  });

  it("marks a path cut at its start with an ellipsis", () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(300);
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    try {
      open();
      expect(screen.getAllByText("…")).toHaveLength(2);
    } finally {
      scrollWidth.mockRestore();
      clientWidth.mockRestore();
    }
  });

  it("copies the relative text it was given", () => {
    open();
    fireEvent.click(screen.getByText("Copy Relative Path"));
    expect(copyToClipboard).toHaveBeenCalledWith("src/a/b.ts", "Copied relative path");
  });

  it("omits relative-path entries that would copy the workspace-root dot", () => {
    openAtWorkspaceRoot();

    expect(screen.queryByText("Copy Relative Path")).toBeNull();
  });
});
