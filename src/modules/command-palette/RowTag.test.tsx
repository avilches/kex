// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RowTag } from "./RowTag";

afterEach(cleanup);

describe("RowTag", () => {
  it("keeps a partly highlighted word in one flex child so it never wraps", () => {
    const { container } = render(<RowTag kind="Agent" hit={3} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.children.length).toBe(1);
    expect(root.textContent).toBe("Agent");
  });

  it("puts the Closed label and the word in two children", () => {
    const { container } = render(<RowTag kind="File" closed />);
    expect((container.firstElementChild as HTMLElement).children.length).toBe(2);
  });
});
