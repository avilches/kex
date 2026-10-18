// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ActionIcon } from "./ActionIcon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(props: Parameters<typeof ActionIcon>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ActionIcon, props)));
  return { container, unmount: () => act(() => root.unmount()) };
}

describe("ActionIcon", () => {
  it("draws the icon of the detected app an action came from", () => {
    const { container, unmount } = render({ action: { appId: "pycharm", runInTerminal: false } });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/assets/editors/pycharm.svg");
    unmount();
  });

  it("draws a glyph, not an image, for a script and for a custom app", () => {
    const script = render({ action: { runInTerminal: true } });
    expect(script.container.querySelector("img")).toBeNull();
    expect(script.container.querySelector("svg")).not.toBeNull();
    script.unmount();
    const custom = render({ action: { runInTerminal: false } });
    expect(custom.container.querySelector("img")).toBeNull();
    expect(custom.container.querySelector("svg")).not.toBeNull();
    custom.unmount();
  });
});
