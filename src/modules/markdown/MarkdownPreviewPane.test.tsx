// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));
const openExternalUrl = vi.fn();
vi.mock("@/modules/markdown/codemirror/lib/externalUrl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/markdown/codemirror/lib/externalUrl")>()),
  openExternalUrl: (url: string) => openExternalUrl(url),
}));

import { MarkdownPreviewPane } from "@/modules/markdown/MarkdownPreviewPane";

function renderPane(markdown: string, path = "/notes/a.md") {
  return render(<MarkdownPreviewPane content={markdown} path={path} />).container;
}

describe("MarkdownPreviewPane", () => {
  afterEach(() => {
    cleanup();
    openExternalUrl.mockReset();
  });

  it("resolves a relative image against the markdown file's directory", () => {
    const img = renderPane("![x](./pic.png)").querySelector("img.cm-lp-image");
    expect(img?.getAttribute("src")).toBe("asset://localhost//notes/./pic.png");
  });

  it("leaves an http image untouched", () => {
    const img = renderPane("![x](https://example.com/p.png)").querySelector("img.cm-lp-image");
    expect(img?.getAttribute("src")).toBe("https://example.com/p.png");
  });

  it("is read-only and shows no line raw", () => {
    const container = renderPane("# Title\n\n**bold**\n");
    expect(container.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("# ");
  });

  it("hides link definitions but still resolves the links that use them", () => {
    const container = renderPane("[site][s]\n\n[s]: https://example.com\n");
    expect(container.textContent).not.toContain("https://example.com");
    expect(container.querySelector(".cm-lp-link-text")?.textContent).toBe("site");
  });

  it("shows the frontmatter as a code block", () => {
    const container = renderPane("---\ntitle: Foo\n---\n\nbody\n");
    expect(container.textContent).toContain("title: Foo");
    expect(container.querySelector(".cm-lp-codeblock")).not.toBeNull();
  });

  it("fills its parent by default and sizes to content with compact", () => {
    const full = render(<MarkdownPreviewPane content="a" path="/n/a.md" />).container.firstElementChild;
    expect(full?.className).toContain("h-full");
    expect(full?.hasAttribute("data-compact")).toBe(false);
    cleanup();
    const compact = render(<MarkdownPreviewPane content="a" compact />).container.firstElementChild;
    expect(compact?.className).toContain("max-h-64");
    expect(compact?.className).not.toContain("h-full");
    expect(compact?.hasAttribute("data-compact")).toBe(true);
  });

  it("renders without a path and keeps absolute and http images working", () => {
    const { container } = render(
      <MarkdownPreviewPane content={"![a](https://example.com/p.png)\n\n![b](/abs/p.png)"} />,
    );
    const srcs = [...container.querySelectorAll("img.cm-lp-image")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["https://example.com/p.png", "asset://localhost//abs/p.png"]);
  });

  it("opens a link with a plain click", () => {
    const container = renderPane("[site](https://example.com)\n");
    const link = container.querySelector(".cm-lp-link-text") as HTMLElement;
    fireEvent.mouseDown(link, { button: 0 });
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com");
  });
});
