// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));

import { MarkdownPreviewPane } from "@/modules/markdown/MarkdownPreviewPane";

async function imgSrc(markdown: string, path = "/notes/a.md"): Promise<string | null> {
  const { container } = render(<MarkdownPreviewPane content={markdown} path={path} />);
  await new Promise((r) => setTimeout(r, 50));
  return container.querySelector("img")?.getAttribute("src") ?? null;
}

describe("MarkdownPreviewPane images", () => {
  afterEach(() => cleanup());

  it("resolves a relative image against the markdown file's directory", async () => {
    expect(await imgSrc("![x](./pic.png)")).toBe("asset://localhost//notes/./pic.png");
  });

  it("leaves an image inside a fenced code block as text", async () => {
    expect(await imgSrc("```\n![x](./pic.png)\n```")).toBeNull();
  });

  it("leaves an http image untouched", async () => {
    expect(await imgSrc("![x](https://example.com/p.png)")).toBe("https://example.com/p.png");
  });
});
