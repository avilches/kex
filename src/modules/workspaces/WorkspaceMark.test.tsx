// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceMark } from "./WorkspaceMark";

afterEach(cleanup);

describe("WorkspaceMark", () => {
  it("draws a circle in the workspace color when it has no icon", () => {
    const { container } = render(<WorkspaceMark id="ws-1" color="#3b82f6" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("style")).toContain("color");
  });

  it("draws nothing when the workspace has neither a color nor an icon", () => {
    const { container } = render(<WorkspaceMark id="ws-1" color={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("keeps the workspace's own icon even without a color", () => {
    const { container } = render(<WorkspaceMark id="ws-1" color={null} icon="HeartIcon" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("draws a different glyph for the workspace's own icon than for the circle", () => {
    const own = render(<WorkspaceMark id="ws-1" icon="HeartIcon" />).container.innerHTML;
    cleanup();
    const circle = render(<WorkspaceMark id="ws-1" />).container.innerHTML;
    expect(own).not.toBe(circle);
  });
});
