// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ActionNameLines } from "./ActionNameLines";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(props: Parameters<typeof ActionNameLines>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ActionNameLines, props)));
  return { container, unmount: () => act(() => root.unmount()) };
}

describe("ActionNameLines", () => {
  it("draws the workspace-root pin before the line only for a root", () => {
    const withPin = render({ name: "Zed {workspace}", value: "/p", root: true });
    expect(withPin.container.querySelector("svg")).not.toBeNull();
    withPin.unmount();
    const without = render({ name: "Zed {workspace}", value: "/p" });
    expect(without.container.querySelector("svg")).toBeNull();
    without.unmount();
  });

  it("keeps the pin on a path cut at its start", () => {
    const { container, unmount } = render({ name: "Zed {workspace}", value: "/very/long/root", startTrim: true, root: true });
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("/very/long/root");
    unmount();
  });
});
