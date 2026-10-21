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
import { CopyAbsolutePathItem, CopyRelativeTextItem } from "./copyPathItems";

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

describe("copy path items", () => {
  afterEach(() => {
    cleanup();
    copyToClipboard.mockClear();
  });

  it("shows the text each entry copies, muted, below its label", () => {
    open();
    expect(screen.getByText("src/a/b.ts").parentElement?.className).toContain("text-muted-foreground");
    expect(screen.getByText("/ws/src/a/b.ts").parentElement?.className).toContain("text-muted-foreground");
  });

  it("keeps a short path left aligned and clips a long one at its start", () => {
    open();
    const sub = screen.getByText("/ws/src/a/b.ts").parentElement!;
    expect(sub.getAttribute("dir")).toBe("rtl");
    expect(sub.className).toContain("truncate");
    expect(sub.className).toContain("text-left");
    expect(screen.getByText("/ws/src/a/b.ts").getAttribute("dir")).toBe("ltr");
  });

  it("copies the relative text it was given", () => {
    open();
    fireEvent.click(screen.getByText("Copy Relative Path"));
    expect(copyToClipboard).toHaveBeenCalledWith("src/a/b.ts", "Copied relative path");
  });
});
