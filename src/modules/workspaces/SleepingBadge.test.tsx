// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SleepingBadge } from "./SleepingBadge";

afterEach(cleanup);

describe("SleepingBadge", () => {
  it("gives the box and the icon the same size, inline, so no container rule can resize the icon", () => {
    const { container } = render(<SleepingBadge size={12} indicator={null} />);
    const box = container.firstElementChild as HTMLElement;
    const svg = container.querySelector("svg") as SVGElement;
    expect([box.style.width, box.style.height]).toEqual(["12px", "12px"]);
    expect([svg.style.width, svg.style.height]).toEqual(["12px", "12px"]);
  });

  it("makes the dot half the icon unless told otherwise, so 12 gets 6 and 14 gets 7", () => {
    const twelve = render(<SleepingBadge size={12} indicator="attention" />);
    const dot12 = twelve.getByLabelText("Agent needs attention");
    expect(dot12.style.width).toBe("6px");
    cleanup();
    const fourteen = render(<SleepingBadge size={14} indicator="error" />);
    expect(fourteen.getByLabelText("Agent needs attention").style.width).toBe("7px");
  });

  it("dims the icon and never the dot", () => {
    render(<SleepingBadge size={12} indicator="attention" />);
    expect(screen.getByLabelText("Tab is hibernated").className).toContain("opacity-40");
    expect(screen.getByLabelText("Agent needs attention").closest(".opacity-40")).toBeNull();
  });

  it("draws no dot without an indicator", () => {
    render(<SleepingBadge size={12} indicator={null} />);
    expect(screen.queryByLabelText("Agent needs attention")).toBeNull();
  });
});
