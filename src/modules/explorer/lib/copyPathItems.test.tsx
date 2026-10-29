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
import { CopyAbsolutePathItem, CopyPathMenu } from "./copyPathItems";

function open(menu: React.ReactNode) {
  render(
    <ContextMenu>
      <ContextMenuTrigger>target</ContextMenuTrigger>
      <ContextMenuContent>{menu}</ContextMenuContent>
    </ContextMenu>,
  );
  act(() => {
    fireEvent.contextMenu(screen.getByText("target"));
  });
}

function openSubmenu() {
  const trigger = screen.getByText("Copy Path").closest("[role=menuitem]")!;
  act(() => {
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
  });
}

describe("copy path items", () => {
  afterEach(() => {
    cleanup();
    copyToClipboard.mockClear();
  });

  it("shows the text each entry copies, muted, below its label", () => {
    open(<CopyAbsolutePathItem path="/ws/src/a/b.ts" />);
    expect(screen.getByText("/ws/src/a/b.ts").closest("[title]")?.className).toContain("text-muted-foreground");
  });

  it("keeps a short path left aligned with no ellipsis", () => {
    open(<CopyAbsolutePathItem path="/ws/src/a/b.ts" />);
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
      open(<CopyAbsolutePathItem path="/ws/src/a/b.ts" />);
      expect(screen.getAllByText("…")).toHaveLength(1);
    } finally {
      scrollWidth.mockRestore();
      clientWidth.mockRestore();
    }
  });

  it("is a plain Copy Absolute Path item when nothing else can be offered", () => {
    open(<CopyPathMenu path="/ws/a.ts" isDir={false} workspaceRoot={null} repoRoot={null} />);
    expect(screen.queryByText("Copy Path")).toBeNull();
    fireEvent.click(screen.getByText("Copy Absolute Path"));
    expect(copyToClipboard).toHaveBeenCalledWith("/ws/a.ts", "Copied absolute path");
  });

  it("groups every base the path can be copied against under Copy Path", () => {
    open(
      <CopyPathMenu
        path="/w/app/src/a.ts"
        isDir={false}
        workspaceRoot="/w"
        repoRoot="/w/app"
        relativeRoot="/w/app/src"
      />,
    );
    openSubmenu();
    expect(
      ["Absolute Path", "Workspace Path", "Repository Path", "Relative Path"].map(
        (label) => screen.queryByText(label) !== null,
      ),
    ).toEqual([true, true, true, true]);
    fireEvent.click(screen.getByText("Repository Path"));
    expect(copyToClipboard).toHaveBeenCalledWith("src/a.ts", "Copied repository path");
  });

  it("leaves out the entries whose base is missing", () => {
    open(<CopyPathMenu path="/w/a.ts" isDir={false} workspaceRoot="/w" repoRoot={null} />);
    openSubmenu();
    expect(screen.queryByText("Workspace Path")).not.toBeNull();
    expect(screen.queryByText("Repository Path")).toBeNull();
    expect(screen.queryByText("Relative Path")).toBeNull();
  });
});
