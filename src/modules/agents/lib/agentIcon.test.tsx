// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { StruckAgentIcon } from "./agentIcon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

function render(node: React.ReactNode): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host!).render(node);
  });
  return host;
}

describe("StruckAgentIcon", () => {
  it("draws the agent icon with a strike line and the given tooltip", () => {
    const root = render(
      <StruckAgentIcon
        agent="claude"
        size={12}
        title="Launch command unknown: restore will use plain claude --resume"
      />,
    );
    const wrapper = root.querySelector("span[title]");
    expect(wrapper?.getAttribute("title")).toBe(
      "Launch command unknown: restore will use plain claude --resume",
    );
    expect(root.querySelector("img")).not.toBeNull();
    expect(root.querySelector("span.rotate-45")).not.toBeNull();
  });
});
