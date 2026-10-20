// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HighlightText } from "./HighlightText";

afterEach(cleanup);

describe("HighlightText", () => {
  it("bolds the runs the indices cover", () => {
    const { container } = render(<HighlightText text="Settings" indices={[0, 1, 4]} />);
    expect(container.querySelectorAll("b").length).toBe(2);
    expect(container.querySelectorAll("b")[0].textContent).toBe("Se");
  });

  it("renders plain text without indices or on an empty match", () => {
    const { container } = render(<HighlightText text="Settings" indices={[]} />);
    expect(container.querySelector("b")).toBeNull();
  });
});
