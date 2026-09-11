// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createTestCrepe } from "@/modules/markdown/milkdown/testCrepe";

// jsdom has no IntersectionObserver; the code-block node view (backing fenced
// code, mermaid, and math blocks) uses one to lazy-mount its CodeMirror instance.
if (!("IntersectionObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const CASES: Array<[string, string]> = [
  ["headings", "# Title\n\n## Sub\n\nBody text.\n"],
  ["nested lists", "- a\n\n  - b\n\n- c\n"],
  ["task list", "- [ ] todo\n\n- [x] done\n"],
  ["table", "| a | b |\n| --- | --- |\n| 1 | 2 |\n"],
  ["fenced code with language", "```ts\nconst x = 1;\n```\n"],
  ["code block nested in a list", "- item\n\n  ```ts\n  const x = 1;\n  ```\n"],
  ["math block", "$$\nx^2 + y^2\n$$\n"],
  ["inline math", "before $x^2$ after\n"],
  ["mermaid fence", "```mermaid\ngraph TD;\nA-->B;\n```\n"],
  ["link with title", '[text](https://example.com "title")\n'],
  ["image", "![alt](./img.png)\n"],
  ["blockquote", "> quoted line\n"],
  ["strikethrough", "~~gone~~\n"],
  ["raw inline html preserved", "keep <u>underline</u> here\n"],
  ["html comment preserved", "text\n\n<!-- a note -->\n\nmore\n"],
];

async function normalize(md: string): Promise<string> {
  const e = await createTestCrepe(md);
  const out = e.getMarkdown();
  await e.destroy();
  return out;
}

describe("milkdown round-trip idempotence", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const [name, input] of CASES) {
    it(`is stable after the first pass: ${name}`, async () => {
      const once = await normalize(input);
      const twice = await normalize(once);
      expect(twice).toBe(once);
    });
  }
});
