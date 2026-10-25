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
    const { container, unmount } = render({ action: { appId: "pycharm", kind: "app" } });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/assets/editors/pycharm.svg");
    unmount();
  });

  it("draws a glyph, not an image, for a script and for a custom app", () => {
    const script = render({ action: { kind: "script" } });
    expect(script.container.querySelector("img")).toBeNull();
    expect(script.container.querySelector("svg")).not.toBeNull();
    script.unmount();
    const custom = render({ action: { kind: "app" } });
    expect(custom.container.querySelector("img")).toBeNull();
    expect(custom.container.querySelector("svg")).not.toBeNull();
    custom.unmount();
  });

  it("draws an agent with its logo, and the generic robot without one", () => {
    const claude = render({ action: { appId: "claude", kind: "agent" } });
    expect(claude.container.querySelector("img")?.getAttribute("alt")).toBe("claude");
    expect(claude.container.querySelector("img")?.getAttribute("src")).not.toContain("/assets/editors/");
    claude.unmount();
    const pi = render({ action: { iconId: "pi", kind: "agent" } });
    expect(pi.container.querySelector("svg[aria-label='pi']")).not.toBeNull();
    pi.unmount();
    const plain = render({ action: { kind: "agent" } });
    expect(plain.container.querySelector("img")).toBeNull();
    expect(plain.container.querySelector("svg")).not.toBeNull();
    plain.unmount();
  });

  it("fill sizes the icon to the two lines next to it, to one constant size", () => {
    const app = render({ action: { appId: "zed", kind: "app" }, fill: true });
    const box = app.container.querySelector("[data-action-icon-fill]")!;
    expect((box as HTMLElement).style.width).toBe("20px");
    expect(box.querySelector("img")?.getAttribute("src")).toBe("/assets/editors/zed.svg");
    app.unmount();
    const glyph = render({ action: { kind: "script" }, fill: true });
    expect(glyph.container.querySelector("[data-action-icon-fill] svg")).not.toBeNull();
    glyph.unmount();
    const agent = render({ action: { appId: "claude", kind: "agent" }, fill: true });
    expect(agent.container.querySelector("[data-action-icon-fill] img")?.getAttribute("alt")).toBe("claude");
    agent.unmount();
  });
});
