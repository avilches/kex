// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AgentIcon, StruckAgentIcon } from "./agentIcon";

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

describe("AgentIcon", () => {
  it("draws Pi as an inline svg so it follows the text color", () => {
    const root = render(<AgentIcon agent="pi" size={14} />);
    const svg = root.querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("currentColor");
    expect(root.querySelector("img")).toBeNull();
  });

  it("draws OpenCode as an inline svg with two tones of the text color", () => {
    const root = render(<AgentIcon agent="opencode" size={14} />);
    const svg = root.querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("currentColor");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 240 300");
    expect(root.querySelector("img")).toBeNull();
    const paths = Array.from(root.querySelectorAll("path"));
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.getAttribute("opacity") === "0.45")).toBe(true);
    expect(paths.every((p) => !p.getAttribute("fill"))).toBe(true);
  });

  it("draws Codex as an inline monochrome svg, never an image", () => {
    for (const agent of ["codex", "Codex"]) {
      const root = render(<AgentIcon agent={agent} size={14} />);
      const svg = root.querySelector("svg");
      expect(svg?.getAttribute("fill")).toBe("currentColor");
      expect(svg?.getAttribute("aria-label")).toBe("codex");
      expect(root.querySelector("img")).toBeNull();
      const paths = Array.from(root.querySelectorAll("path"));
      expect(paths.every((p) => !p.getAttribute("fill"))).toBe(true);
      host?.remove();
    }
  });

  it("keeps drawing the other known agents as images", () => {
    const root = render(<AgentIcon agent="omp" size={14} />);
    expect(root.querySelector("img")).not.toBeNull();
  });
});
