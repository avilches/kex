// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentSession } from "@/modules/agents/lib/types";
import { TabBarIcon } from "./tabBarIcon";
import type { Tab } from "./types";

afterEach(cleanup);

const terminal: Tab = { id: "t", kind: "terminal" };
const session = { agent: "claude" } as AgentSession;
const sizeOf = (el: Element | null) => {
  const e = el as HTMLElement | null;
  return e ? [e.style.width || e.getAttribute("width"), e.style.height || e.getAttribute("height")] : null;
};

describe("TabBarIcon size", () => {
  it("draws every icon at 13 by default, as the tab strip and the palette always did", () => {
    const agent = render(<TabBarIcon tab={terminal} agentSession={session} />);
    expect(sizeOf(agent.container.querySelector("img, svg"))).toEqual(["13px", "13px"]);
    cleanup();
    const plain = render(<TabBarIcon tab={terminal} agentSession={undefined} />);
    expect(sizeOf(plain.container.querySelector("svg"))).toEqual(["13", "13"]);
  });

  it("passes a larger size down to an agent mark", () => {
    const { container } = render(<TabBarIcon tab={terminal} agentSession={session} size={26} />);
    expect(sizeOf(container.querySelector("img, svg"))).toEqual(["26px", "26px"]);
  });

  it("passes a larger size down to the icon of a plain tab", () => {
    const { container } = render(<TabBarIcon tab={terminal} agentSession={undefined} size={26} />);
    expect(sizeOf(container.querySelector("svg"))).toEqual(["26", "26"]);
  });

  it("passes a larger size down to a file icon", () => {
    const editor: Tab = { id: "e", kind: "editor", path: "/p/a.ts", dirty: false, preview: false };
    const { container } = render(<TabBarIcon tab={editor} agentSession={undefined} size={26} />);
    const img = container.querySelector("img") as HTMLElement;
    expect(img.style.width).toBe("26px");
  });

  it("keeps the default file icon at its class size", () => {
    const editor: Tab = { id: "e", kind: "editor", path: "/p/a.ts", dirty: false, preview: false };
    const { container } = render(<TabBarIcon tab={editor} agentSession={undefined} />);
    expect(container.querySelector("img")?.className).toContain("size-3.5");
  });
});
