// @vitest-environment happy-dom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clipboard = vi.hoisted(() => ({ write: vi.fn(async (_text: string) => true) }));
vi.mock("@/lib/clipboard", () => ({ writeClipboardText: clipboard.write }));

import { HibernatedInfo } from "./HibernatedInfo";

const props = {
  icon: null,
  title: "Claude Code",
  folder: "/Users/me/Hub/Kex",
  command: "claude --resume abc",
  home: "/Users/me",
};

describe("HibernatedInfo", () => {
  beforeEach(() => clipboard.write.mockClear());
  afterEach(cleanup);

  it("lists the folder (with ~) and the command under their labels", () => {
    const { getByText } = render(<HibernatedInfo {...props} />);
    expect(getByText("Claude Code")).toBeTruthy();
    expect(getByText("Folder")).toBeTruthy();
    expect(getByText("Command")).toBeTruthy();
    expect(getByText("~/Hub/Kex")).toBeTruthy();
    expect(getByText("claude --resume abc")).toBeTruthy();
  });

  it("dims the folder and the command the same", () => {
    const { container } = render(<HibernatedInfo {...props} />);
    const folder = container.querySelector('[data-hibernated-value="folder"]')!;
    const command = container.querySelector('[data-hibernated-value="command"]')!;
    expect(folder.className).toContain("opacity-70");
    expect(command.className).toContain("opacity-70");
  });

  it("copies the full folder path, not the abbreviated one, and shows it was copied", async () => {
    const { getByLabelText } = render(<HibernatedInfo {...props} />);
    fireEvent.click(getByLabelText("Copy folder"));
    await waitFor(() => expect(getByLabelText("Copy folder").getAttribute("title")).toBe("Copied"));
    expect(clipboard.write).toHaveBeenCalledWith("/Users/me/Hub/Kex");
  });

  it("copies the command", () => {
    const { getByLabelText } = render(<HibernatedInfo {...props} />);
    fireEvent.click(getByLabelText("Copy command"));
    expect(clipboard.write).toHaveBeenCalledWith("claude --resume abc");
  });

  it("does not claim a copy that failed", async () => {
    clipboard.write.mockResolvedValueOnce(false);
    const { getByLabelText } = render(<HibernatedInfo {...props} />);
    fireEvent.click(getByLabelText("Copy command"));
    await Promise.resolve();
    expect(getByLabelText("Copy command").getAttribute("title")).toBe("Copy command");
  });

  it("leaves out the rows it has nothing for, and the table with them", () => {
    const { container, queryByText } = render(<HibernatedInfo {...props} folder={null} command={null} />);
    expect(container.querySelector("[data-hibernated-table]")).toBeNull();
    expect(queryByText("Folder")).toBeNull();
  });
});
