// @vitest-environment happy-dom
import { DndContext } from "@dnd-kit/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ themeId: "t", customThemes: [] }) }));

import { FsRootRow, FsUpRow } from "./TreeRow";

afterEach(() => cleanup());

const wrap = (node: React.ReactNode) => render(<DndContext>{node}</DndContext>);

describe("the parent row", () => {
  it("is focusable and goes up with Enter or Space, with a name a screen reader can read", () => {
    const up = vi.fn();
    wrap(<FsUpRow path="/a/b" workspaceRoot={null} onNavigateUp={up} />);
    const row = screen.getByRole("button", { name: "Go to parent folder" });
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    fireEvent.keyDown(row, { key: "a" });
    expect(up).toHaveBeenCalledTimes(2);
  });

  it("keeps its Go to parent chip as a real button", () => {
    wrap(<FsUpRow path="/a/b" workspaceRoot={null} onNavigateUp={() => {}} />);
    expect(screen.getByText("Go to parent").tagName).toBe("BUTTON");
  });
});

describe("the Open chip of the file system root", () => {
  it("is a real button when it is the workspace root", () => {
    const open = vi.fn();
    wrap(<FsRootRow path="/w" workspaceRoot="/w" flashToken={0} isWorkspaceRoot onOpenInExplorer={open} />);
    const chip = screen.getByText("Open");
    expect(chip.tagName).toBe("BUTTON");
    fireEvent.click(chip);
    expect(open).toHaveBeenCalledWith("/w");
  });
});
