// @vitest-environment happy-dom
import { forceParsing, syntaxTreeAvailable } from "@codemirror/language";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleLinkMousedown,
  linkClickHandler,
  linkUrlAt,
  livePreviewPlugin,
  wikiLinkHost,
  type WikiLinkHost,
} from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

const openUrl = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

const writeClipboardText = vi.hoisted(() => vi.fn((_text: string) => Promise.resolve(true)));
vi.mock("@/lib/clipboard", () => ({ writeClipboardText }));

// IS_MAC is read live at call time inside handleLinkMousedown, so mutating
// this mocked module's property between tests is enough to flip branches;
// no module reset or re-import is needed.
const platformMock = vi.hoisted(() => ({ IS_MAC: false }));
vi.mock("@/lib/platform", () => platformMock);

const identitySrc = (src: string) => src;

function mount(doc: string, selection?: { anchor: number; extensions?: Extension[] }) {
  const state = EditorState.create({
    doc,
    selection: selection ? { anchor: selection.anchor } : undefined,
    extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin(identitySrc), ...(selection?.extensions ?? [])],
  });
  return new EditorView({ state, parent: document.body });
}

describe("livePreviewPlugin", () => {
  it("hides the heading marker when the cursor is elsewhere", () => {
    const view = mount("# Title\n\nOther line", { anchor: 19 });
    expect(view.dom.textContent).not.toContain("#");
    expect(view.dom.textContent).toContain("Title");
    view.destroy();
  });

  it("reveals the heading marker when the cursor is on that line", () => {
    const view = mount("# Title\n\nOther line", { anchor: 3 });
    expect(view.dom.textContent).toContain("# Title");
    view.destroy();
  });

  it("renders a real checkbox input for a task item the cursor is not on", () => {
    const doc = "- [ ] todo\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const checkbox = view.dom.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    view.destroy();
  });

  it("toggles the underlying text when the checkbox is clicked", () => {
    const doc = "- [ ] todo\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const checkbox = view.dom.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.state.doc.toString()).toBe("- [x] todo\n\nafter\n");
    view.destroy();
  });

  it("reveals markers on every line holding a cursor and keeps other lines hidden", () => {
    const doc = "**one**\n**two**\n**three**\n";
    const state = EditorState.create({
      doc,
      selection: EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(18)]),
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        markdown({ base: markdownLanguage }),
        livePreviewPlugin(identitySrc),
      ],
    });
    const view = new EditorView({ state, parent: document.body });
    expect(view.state.selection.ranges.length).toBe(2);
    const lines = Array.from(view.dom.querySelectorAll(".cm-line")).map((l) => l.textContent);
    expect(lines[0]).toBe("**one**");
    expect(lines[1]).toBe("two");
    expect(lines[2]).toBe("**three**");
    view.destroy();
  });

  it("decorates content past the initial parse boundary once the background parse lands", () => {
    // Few, long lines: past the ~3000-char initial parse, but still few enough
    // lines to sit inside happy-dom's rendered viewport.
    const filler = `${"plain filler prose ".repeat(40)}\n\n`.repeat(6);
    const doc = `${filler}**late**\n`;
    const view = mount(doc, { anchor: 0 });
    const lateLine = () =>
      Array.from(view.dom.querySelectorAll(".cm-line")).find((l) => l.textContent?.includes("late"));
    // The initial synchronous parse stops well before the end of this document.
    expect(syntaxTreeAvailable(view.state, doc.length)).toBe(false);
    expect(lateLine()?.textContent).toBe("**late**");
    // Finishing the parse dispatches a transaction that changes only the tree.
    forceParsing(view, doc.length, 5000);
    expect(syntaxTreeAvailable(view.state, doc.length)).toBe(true);
    expect(lateLine()?.textContent).toBe("late");
    view.destroy();
  });

  it("styles every code line of a fenced block as a line, blank lines included", () => {
    const doc = "intro\n\n```js\nconst x = 1;\n\nlet y;\n```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const styled = Array.from(view.dom.querySelectorAll(".cm-lp-codeblock"));
    // The two fence lines are not code lines while the cursor is outside the block.
    expect(styled.map((el) => el.textContent)).toEqual(["const x = 1;", "", "let y;"]);
    expect(styled.every((el) => el.classList.contains("cm-line"))).toBe(true);
    view.destroy();
  });

  it("puts a copy button in the block header that copies the code and then confirms it", async () => {
    writeClipboardText.mockClear();
    const doc ="```js\nconst x = 1;\nlet y;\n```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    expect(view.dom.querySelector(".cm-lp-code-lang")?.textContent).toBe("js");
    const button = view.dom.querySelector(".cm-lp-code-copy") as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(writeClipboardText).toHaveBeenCalledWith("const x = 1;\nlet y;");
    await vi.waitFor(() => expect(button.classList.contains("copied")).toBe(true));
    view.destroy();
  });

  it("does not confirm the copy when the native write fails", async () => {
    writeClipboardText.mockClear();
    writeClipboardText.mockResolvedValueOnce(false);
    const doc = "```js\nconst x = 1;\n```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const button = view.dom.querySelector(".cm-lp-code-copy") as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(writeClipboardText).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(button.classList.contains("copied")).toBe(false);
    view.destroy();
  });

  it("shows no language tag for a block without one, but still the copy button", () => {
    const doc = "```\nplain\n```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    expect(view.dom.querySelector(".cm-lp-code-lang")).toBeNull();
    expect(view.dom.querySelector(".cm-lp-code-copy")).not.toBeNull();
    view.destroy();
  });

  it("renders subscript and superscript with their markers hidden", () => {
    const doc = "H~2~O and X^2^\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    expect(view.dom.querySelector(".cm-lp-sub")?.textContent).toBe("2");
    expect(view.dom.querySelector(".cm-lp-sup")?.textContent).toBe("2");
    expect(view.dom.textContent).not.toContain("~");
    expect(view.dom.textContent).not.toContain("^");
    view.destroy();
  });

  it("reveals the fence marks once the cursor moves inside the code block", () => {
    const doc = "```js\nconst x = 1;\n```\n";
    const view = mount(doc, { anchor: doc.indexOf("const") });
    const styled = Array.from(view.dom.querySelectorAll(".cm-lp-codeblock"));
    expect(styled.map((el) => el.textContent)).toEqual(["```js", "const x = 1;", "```"]);
    view.destroy();
  });

  it("replaces an inactive horizontal rule with a real <hr>-like widget, and reveals the raw dashes on its line", () => {
    const doc = "before\n\n---\n\nafter\n";
    const inactive = mount(doc, { anchor: doc.indexOf("after") });
    expect(inactive.dom.textContent).not.toContain("---");
    expect(inactive.dom.querySelector(".cm-lp-hr")).not.toBeNull();
    inactive.destroy();

    const active = mount(doc, { anchor: doc.indexOf("---") });
    expect(active.dom.textContent).toContain("---");
    expect(active.dom.querySelector(".cm-lp-hr")).toBeNull();
    active.destroy();
  });

  it("marks a blockquote and hides its > marker except on the active line", () => {
    const doc = "> line one\n> line two\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const quote = view.dom.querySelector(".cm-lp-quote");
    expect(quote).not.toBeNull();
    expect(view.dom.textContent).not.toContain(">");
    expect(view.dom.textContent).toContain("line one");
    expect(view.dom.textContent).toContain("line two");
    view.destroy();

    const active = mount(doc, { anchor: doc.indexOf("line two") });
    expect(active.dom.textContent).toContain("> line two");
    active.destroy();
  });

  it("shows a reference link as its label, with the definition's title as tooltip, and hides the definition line", () => {
    const doc = 'Use [ref-id] now.\n\n[ref-id]: https://github.com "GitHub"\n\nend\n';
    const view = mount(doc, { anchor: doc.indexOf("end") });
    const link = view.dom.querySelector(".cm-lp-link-text") as HTMLElement;
    expect(link.textContent).toBe("ref-id");
    expect(link.getAttribute("title")).toBe("GitHub");
    expect(view.dom.textContent).not.toContain("github.com");
    expect(view.dom.textContent).not.toContain("[ref-id]");
    view.destroy();

    const active = mount(doc, { anchor: doc.indexOf("github") });
    expect(active.dom.textContent).toContain('[ref-id]: https://github.com "GitHub"');
    active.destroy();
  });

  it("finds the URL of a reference link for Cmd/Ctrl+click, and none for an undefined label", () => {
    const doc = "Use [ref-id] and [TODO].\n\n[ref-id]: https://github.com\n";
    const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
    expect(linkUrlAt(state, doc.indexOf("ref-id") + 2)).toBe("https://github.com");
    expect(linkUrlAt(state, doc.indexOf("TODO") + 1)).toBeNull();
  });

  it("finds the URL of an <autolink>, a bare URL, a www. address and an e-mail address for Cmd/Ctrl+click", () => {
    const doc = "A <https://a.com> b https://b.com/x c www.c.com d me@d.com e ./no-es-externo\n";
    const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
    expect(linkUrlAt(state, doc.indexOf("a.com") + 2)).toBe("https://a.com");
    expect(linkUrlAt(state, doc.indexOf("b.com") + 2)).toBe("https://b.com/x");
    expect(linkUrlAt(state, doc.indexOf("www.c") + 2)).toBe("https://www.c.com");
    expect(linkUrlAt(state, doc.indexOf("me@") + 2)).toBe("mailto:me@d.com");
    expect(linkUrlAt(state, doc.indexOf("./no-es") + 3)).toBeNull();
  });

  it("does not treat the destination of an inline link as a second, bare link", () => {
    const doc = "[texto](https://a.com/x)\n";
    const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
    expect(linkUrlAt(state, doc.indexOf("a.com") + 2)).toBe("https://a.com/x");
    expect(linkUrlAt(state, 2)).toBe("https://a.com/x");
  });

  it("puts a class on the editor while the open-link modifier is held, and drops it when the key is released or focus is lost", () => {
    const view = mount("text\n");
    const key = (type: string, init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent(type, init));
    // IS_MAC is mocked false in this file, so Ctrl is the modifier.
    key("keydown", { key: "Control", ctrlKey: true });
    expect(view.dom.classList.contains("cm-lp-mod")).toBe(true);
    key("keyup", { key: "Control", ctrlKey: false });
    expect(view.dom.classList.contains("cm-lp-mod")).toBe(false);
    key("keydown", { key: "Meta", metaKey: true });
    expect(view.dom.classList.contains("cm-lp-mod")).toBe(false);
    key("keydown", { key: "Control", ctrlKey: true });
    window.dispatchEvent(new Event("blur"));
    expect(view.dom.classList.contains("cm-lp-mod")).toBe(false);
    view.destroy();
  });

  it("syncs the modifier class when the pointer moves over the editor, and removes its listeners on destroy", () => {
    const view = mount("text\n");
    view.dom.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: true }));
    expect(view.dom.classList.contains("cm-lp-mod")).toBe(true);
    view.destroy();
    expect(view.dom.classList.contains("cm-lp-mod")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));
    expect(view.dom.classList.contains("cm-lp-mod")).toBe(false);
  });

  it("renders bold, italic, code, strikethrough, sub/superscript, links and line breaks inside a table cell", () => {
    const doc =
      "| A | B |\n|---|---|\n| **bold** and *it* | `code` ~~gone~~ H~2~O X^2^ |\n| [go](https://a.com) <https://b.com> | one<br>two |\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const cells = Array.from(view.dom.querySelectorAll(".cm-lp-table td"));
    expect(cells[0].querySelector("strong")?.textContent).toBe("bold");
    expect(cells[0].querySelector("em")?.textContent).toBe("it");
    expect(cells[1].querySelector("code.cm-lp-code")?.textContent).toBe("code");
    expect(cells[1].querySelector("del")?.textContent).toBe("gone");
    expect(cells[1].querySelector(".cm-lp-sub")?.textContent).toBe("2");
    expect(cells[1].querySelector(".cm-lp-sup")?.textContent).toBe("2");
    const links = Array.from(cells[2].querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["go", "https://a.com"],
      ["https://b.com", "https://b.com"],
    ]);
    expect(cells[3].querySelector("br")).not.toBeNull();
    expect(view.dom.textContent).not.toContain("**");
    view.destroy();
  });

  it("shows a link with a relative destination inside a table cell as its text, not as a link", () => {
    const doc = "| A |\n|---|\n| [notes](./notes.md) |\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const cell = view.dom.querySelector(".cm-lp-table td");
    expect(cell?.textContent).toBe("notes");
    expect(cell?.querySelector("a")).toBeNull();
    view.destroy();
  });

  it("styles text indented by four spaces as a code block, indentation hidden until the cursor is in it", () => {
    const doc = "intro\n\n    const x = 1;\n\n    let y;\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const styled = Array.from(view.dom.querySelectorAll(".cm-lp-codeblock")).map((el) => el.textContent);
    expect(styled).toEqual(["const x = 1;", "", "let y;"]);
    view.destroy();

    const active = mount(doc, { anchor: doc.indexOf("const") });
    const raw = Array.from(active.dom.querySelectorAll(".cm-lp-codeblock")).map((el) => el.textContent);
    expect(raw).toEqual(["    const x = 1;", "", "    let y;"]);
    active.destroy();
  });

  it("marks brackets that are not a link, so the theme's link color can be taken back", () => {
    const doc = "Plain [TODO] and [real](https://x.com).\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const notlinks = Array.from(view.dom.querySelectorAll(".cm-lp-notlink")).map((el) => el.textContent);
    expect(notlinks).toContain("[TODO]");
    expect(view.dom.querySelectorAll(".cm-lp-link-text").length).toBe(1);
    expect(view.dom.querySelector(".cm-lp-link-text")?.textContent).toBe("real");
    view.destroy();
  });

  it("shows a [[wiki link]] as a link when its note exists and as a dim one when it does not", () => {
    const doc = "See [[Known]] and [[Ghost|alias]].\n\nafter\n";
    const host = {
      resolve: (t: string) => (t === "Known" ? "/ws/Known.md" : null),
      open: () => {},
    };
    const view = mount(doc, { anchor: doc.indexOf("after"), extensions: [wikiLinkHost.of(host)] });
    expect(Array.from(view.dom.querySelectorAll(".cm-lp-link-text")).map((el) => el.textContent)).toEqual(["Known"]);
    expect(Array.from(view.dom.querySelectorAll(".cm-lp-wikilink-missing")).map((el) => el.textContent)).toEqual([
      "alias",
    ]);
    view.destroy();
  });


  it("replaces an image that fails to load with its alt text, or a fallback word without one", () => {
    const doc = "Pic ![Rota](./no-existe.png) and ![](./otra.png) here\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const imgs = Array.from(view.dom.querySelectorAll("img.cm-lp-image"));
    expect(imgs.length).toBe(2);
    for (const img of imgs) img.dispatchEvent(new Event("error"));
    const broken = Array.from(view.dom.querySelectorAll(".cm-lp-image-broken")).map((el) => el.textContent);
    expect(broken).toEqual(["Rota", "image"]);
    expect(view.dom.querySelector("img.cm-lp-image")).toBeNull();
    view.destroy();
  });

  it("indents a code block nested in a list item by its list depth, with the container indentation hidden", () => {
    const doc = "- item\n\n  ```js\n  const x = 1;\n  ```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const code = view.dom.querySelector(".cm-lp-codeblock") as HTMLElement;
    expect(code.textContent).toBe("const x = 1;");
    expect(code.classList.contains("cm-lp-list-code")).toBe(true);
    expect(code.classList.contains("cm-lp-list")).toBe(false);
    expect(code.getAttribute("style")).toContain("--lp-list-depth: 1");
    view.destroy();
  });

  it("shows a quoted code block without any stray > markers, and with them back once the cursor is in", () => {
    const doc = "> Cita:\n>\n> ```python\n> print(1)\n> ```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    expect(view.dom.textContent).not.toContain(">");
    view.destroy();

    const active = mount(doc, { anchor: doc.indexOf("print") });
    expect(active.dom.textContent).toContain("> print(1)");
    expect(active.dom.textContent).toContain("> ```python");
    active.destroy();
  });

  it("renders a table inside a list item as a widget carrying the item's depth", () => {
    const doc = "1. Tabla:\n\n   | A | B |\n   |---|---|\n   | 1 | 2 |\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const wrap = view.dom.querySelector(".cm-lp-table-wrap") as HTMLElement;
    expect(wrap).not.toBeNull();
    expect(wrap.style.getPropertyValue("--lp-list-depth")).toBe("1");
    expect(view.dom.textContent).not.toContain("|");
    view.destroy();

    const active = mount(doc, { anchor: doc.indexOf("| 1") });
    expect(active.dom.querySelector(".cm-lp-table-wrap")).toBeNull();
    expect(active.dom.textContent).toContain("| A | B |");
    active.destroy();
  });

  it("marks the lines of code no language highlights as plain, and only those", () => {
    const doc = "```js\na\n```\n\n```\nb\n```\n\n    c\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const plain = Array.from(view.dom.querySelectorAll(".cm-lp-codeblock")).map((l) => [
      l.textContent,
      l.classList.contains("cm-lp-code-plain"),
    ]);
    expect(plain).toEqual([
      ["a", false],
      ["b", true],
      ["c", true],
    ]);
    view.destroy();
  });

  it("gives a rendered block's first and last code line their padding, and none to indented lines between", () => {
    const doc = "```js\nfirst\nmiddle\nlast\n```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const code = Array.from(view.dom.querySelectorAll(".cm-lp-codeblock"));
    expect(code.map((l) => l.classList.contains("cm-lp-code-first"))).toEqual([true, false, false]);
    expect(code.map((l) => l.classList.contains("cm-lp-code-last"))).toEqual([false, false, true]);
    view.destroy();
  });

  it("collapses a rendered block's two fence lines, and lets the raw fences back in once the cursor enters", () => {
    const doc = "```js\ncode\n```\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const fences = Array.from(view.dom.querySelectorAll(".cm-lp-fence-line"));
    expect(fences.length).toBe(2);
    expect(fences[0].querySelector(".cm-lp-code-header")).not.toBeNull();
    expect(fences[1].textContent).toBe("");
    view.destroy();

    const active = mount(doc, { anchor: doc.indexOf("code") });
    expect(active.dom.querySelector(".cm-lp-fence-line")).toBeNull();
    expect(active.dom.querySelector(".cm-lp-code-header")).toBeNull();
    active.destroy();
  });

  it("shows the lines of a paragraph as one text, and separate raw lines once the cursor is in it", () => {
    const doc = "one\ntwo\nthree\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const lines = Array.from(view.dom.querySelectorAll(".cm-line")).map((l) => l.textContent);
    expect(lines).toEqual(["one two three", "", "after", ""]);
    view.destroy();

    const active = mount(doc, { anchor: doc.indexOf("two") });
    const rawLines = Array.from(active.dom.querySelectorAll(".cm-line")).map((l) => l.textContent);
    expect(rawLines.slice(0, 3)).toEqual(["one", "two", "three"]);
    active.destroy();
  });

  it("joins the lines of a quote into one bar-carrying line, with no stray markers", () => {
    const doc = "> one\n> two\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const quote = Array.from(view.dom.querySelectorAll(".cm-lp-quote-line"));
    expect(quote.map((l) => l.textContent)).toEqual(["one two"]);
    view.destroy();
  });

  it("gives each quote line a bar per nesting level, whatever spaces separate the markers", () => {
    const doc = ">  first\n>  >    second\nlazy\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const lines = Array.from(view.dom.querySelectorAll(".cm-lp-quote-line"));
    // "second" and its lazy continuation "lazy" are one paragraph, so they show as one line.
    expect(lines.map((l) => l.textContent)).toEqual(["first", "second lazy"]);
    expect(lines.map((l) => l.getAttribute("style")?.replace(/;$/, ""))).toEqual([
      "--lp-quote-depth: 1",
      "--lp-quote-depth: 2",
    ]);
    view.destroy();
  });

  it("carries each list line's nesting depth as a custom property", () => {
    const doc = "- one\n  - two\n1. three\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const lines = Array.from(view.dom.querySelectorAll(".cm-lp-list"));
    expect(lines.map((l) => l.getAttribute("style")?.replace(/;$/, ""))).toEqual([
      "--lp-list-depth: 1",
      "--lp-list-depth: 2",
      "--lp-list-depth: 1",
    ]);
    view.destroy();
  });

  it("gives a quote inside a list item its indent as a custom property, and none to a list inside a quote", () => {
    const doc = "- item\n\n  > quoted\n\n> - inside\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const quotes = Array.from(view.dom.querySelectorAll(".cm-lp-quote-line"));
    const styles = quotes.map((q) => q.getAttribute("style") ?? "");
    expect(styles[0]).toContain("--lp-quote-indent: 1");
    expect(styles[1]).not.toContain("--lp-quote-indent");
    view.destroy();
  });

  it("keeps both custom properties on a list line inside a quote", () => {
    const doc = "> - one\n>   - two\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const line = view.dom.querySelectorAll(".cm-lp-list.cm-lp-quote-line")[1];
    const style = line?.getAttribute("style") ?? "";
    expect(style).toContain("--lp-quote-depth: 1");
    expect(style).toContain("--lp-list-depth: 2");
    view.destroy();
  });

  it("puts a heading's spacing class on its line, by level", () => {
    const doc = "# One\n\n## Two\n\ntext\n";
    const view = mount(doc, { anchor: doc.indexOf("text") });
    expect(view.dom.querySelector(".cm-lp-hl1")?.textContent).toBe("One");
    expect(view.dom.querySelector(".cm-lp-hl2")?.textContent).toBe("Two");
    expect(view.dom.querySelectorAll(".cm-lp-heading-line").length).toBe(2);
    view.destroy();
  });

  it("puts a task item's checkbox where a plain item's bullet is, with no bullet or dash of its own", () => {
    const doc = "- plain\n- [ ] task\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    const lines = Array.from(view.dom.querySelectorAll(".cm-line"));
    expect(lines[0].querySelector(".cm-lp-bullet-dot")).not.toBeNull();
    expect(lines[1].querySelector(".cm-lp-bullet-dot")).toBeNull();
    expect(lines[1].querySelector(".cm-lp-checkbox")).not.toBeNull();
    expect(lines[1].textContent).toBe(" task");
    view.destroy();
  });

  it("shows a task item as plain editable text while its line is active", () => {
    const doc = "- [ ] task\n";
    const view = mount(doc, { anchor: 4 });
    const line = view.dom.querySelector(".cm-line") as HTMLElement;
    expect(line.textContent).toBe("- [ ] task");
    expect(line.querySelector(".cm-lp-checkbox")).toBeNull();
    view.destroy();
  });

  it("replaces an inactive bullet marker with a dot but leaves an ordered marker as plain text", () => {
    const doc = "- one\n1. two\n\nafter\n";
    const view = mount(doc, { anchor: doc.indexOf("after") });
    expect(view.dom.querySelector(".cm-lp-bullet-dot")).not.toBeNull();
    expect(view.dom.textContent).not.toContain("- one");
    expect(view.dom.textContent).toContain("one");
    expect(view.dom.textContent).toContain("1. two");
    view.destroy();
  });

  it("reveals the raw bullet marker on its own active line", () => {
    const doc = "- one\n- two\n";
    const view = mount(doc, { anchor: doc.indexOf("two") });
    expect(view.dom.textContent).toContain("- two");
    view.destroy();
  });

  it("renders an inactive image as a real <img>, resolved through the given resolver", () => {
    const doc = "before\n\n![a cat](cat.png)\n\nafter\n";
    const resolve = vi.fn((src: string) => `resolved:${src}`);
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.indexOf("after") },
      extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin(resolve)],
    });
    const view = new EditorView({ state, parent: document.body });
    const img = view.dom.querySelector(".cm-lp-image") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.alt).toBe("a cat");
    expect(img.src).toContain("resolved:cat.png");
    expect(resolve).toHaveBeenCalledWith("cat.png");
    expect(view.dom.textContent).not.toContain("![a cat]");
    view.destroy();
  });

  it("shows the raw image markdown while the cursor is on its line", () => {
    const doc = "![a cat](cat.png)\n";
    const view = mount(doc, { anchor: 0 });
    expect(view.dom.querySelector(".cm-lp-image")).toBeNull();
    expect(view.dom.textContent).toContain("![a cat](cat.png)");
    view.destroy();
  });

  it("never decorates the frontmatter block", () => {
    const view = mount("---\ntitle: **not bold**\n---\n# Real\n", { anchor: 0 });
    // The frontmatter's own ** stays literal; only "Real" (after the closing ---) is a heading.
    const bodyText = view.dom.textContent ?? "";
    expect(bodyText).toContain("title: **not bold**");
    view.destroy();
  });
});

describe("table widget", () => {
  const TABLE =
    "| Name | Link | N |\n" +
    "|:---|:---:|---:|\n" +
    "| a | [the docs](https://example.com) | 1 |\n" +
    "| b |  | 2 |\n" +
    "\nafter\n";

  beforeEach(() => openUrl.mockClear());

  it("renders an inactive table as a real <table> with its rows and cells", () => {
    const view = mount(TABLE, { anchor: TABLE.indexOf("after") });
    const table = view.dom.querySelector("table");
    expect(table).not.toBeNull();
    const headerCells = Array.from(table?.querySelectorAll("thead th") ?? []).map((c) => c.textContent);
    expect(headerCells).toEqual(["Name", "Link", "N"]);
    const bodyRows = Array.from(table?.querySelectorAll("tbody tr") ?? []).map((r) =>
      Array.from(r.querySelectorAll("td")).map((c) => c.textContent),
    );
    expect(bodyRows).toEqual([
      ["a", "the docs", "1"],
      ["b", "", "2"],
    ]);
    const aligns = Array.from(table?.querySelectorAll("thead th") ?? []).map(
      (c) => (c as HTMLElement).style.textAlign,
    );
    expect(aligns).toEqual(["left", "center", "right"]);
    expect(view.dom.textContent).not.toContain("|:---|");
    view.destroy();
  });

  it("reveals the raw table source when the cursor moves onto one of its lines", () => {
    const view = mount(TABLE, { anchor: TABLE.indexOf("after") });
    expect(view.dom.querySelector("table")).not.toBeNull();
    view.dispatch({ selection: { anchor: TABLE.indexOf("| b") + 2 } });
    expect(view.dom.querySelector("table")).toBeNull();
    expect(view.dom.textContent).toContain("|:---|:---:|---:|");
    view.dispatch({ selection: { anchor: TABLE.indexOf("after") } });
    expect(view.dom.querySelector("table")).not.toBeNull();
    view.destroy();
  });

  it("opens a cell link on a plain click without moving into the table", async () => {
    const view = mount(TABLE, { anchor: TABLE.indexOf("after") });
    const link = view.dom.querySelector("table a") as HTMLAnchorElement;
    expect(link.textContent).toBe("the docs");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://example.com"));
    expect(view.dom.querySelector("table")).not.toBeNull();
    view.destroy();
  });

  it("does not open a cell link on a right-click", async () => {
    const view = mount(TABLE, { anchor: TABLE.indexOf("after") });
    const link = view.dom.querySelector("table a") as HTMLAnchorElement;
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(openUrl).not.toHaveBeenCalled();
    view.destroy();
  });

  it("blocks the webview's own middle-click navigation on a cell link", () => {
    const view = mount(TABLE, { anchor: TABLE.indexOf("after") });
    const link = view.dom.querySelector("table a") as HTMLAnchorElement;
    const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    view.destroy();
  });
});

describe("linkClickHandler", () => {
  beforeEach(() => openUrl.mockClear());

  // happy-dom has no layout, so posAtCoords is stubbed to the offset under the
  // pointer; everything after it (tree lookup, URL extraction, open) is real.
  function mountLink(doc: string, pointerPos: number) {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin(identitySrc), linkClickHandler],
    });
    const view = new EditorView({ state, parent: document.body });
    vi.spyOn(view, "posAtCoords").mockReturnValue(pointerPos);
    return view;
  }

  function mousedown(view: EditorView, init: MouseEventInit) {
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, ...init });
    view.contentDOM.dispatchEvent(event);
    return event;
  }

  const doc = "see [the docs](https://example.com) here\n";
  const onLinkText = doc.indexOf("docs");

  // CodeMirror's own mouse-selection handling also calls preventDefault on a
  // mousedown it receives, so the negative cases call the handler directly to
  // see exactly what this extension does.
  function runHandler(view: EditorView, init: MouseEventInit) {
    const event = new MouseEvent("mousedown", { cancelable: true, ...init });
    const handled = handleLinkMousedown(event, view);
    return { handled, prevented: event.defaultPrevented };
  }

  describe("modifier key by platform", () => {
    afterEach(() => {
      platformMock.IS_MAC = false;
    });

    it("on macOS opens on Cmd+click and ignores a Ctrl+click (the context-menu gesture)", async () => {
      platformMock.IS_MAC = true;

      const negView = mountLink(doc, onLinkText);
      expect(runHandler(negView, { ctrlKey: true })).toEqual({ handled: false, prevented: false });
      negView.destroy();

      const posView = mountLink(doc, onLinkText);
      const metaEvent = mousedown(posView, { metaKey: true });
      expect(metaEvent.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://example.com"));
      posView.destroy();
    });

    it("outside macOS opens on Ctrl+click and ignores a Cmd+click", async () => {
      platformMock.IS_MAC = false;

      const negView = mountLink(doc, onLinkText);
      expect(runHandler(negView, { metaKey: true })).toEqual({ handled: false, prevented: false });
      negView.destroy();

      const posView = mountLink(doc, onLinkText);
      const ctrlEvent = mousedown(posView, { ctrlKey: true });
      expect(ctrlEvent.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://example.com"));
      posView.destroy();
    });
  });

  describe("wiki links", () => {
    const wikiDoc = "See [[Known]] and `[[Code]]`.\n";

    function mountWiki(pointerPos: number, opened: string[]) {
      platformMock.IS_MAC = false;
      const host: WikiLinkHost = { resolve: () => "/ws/x.md", open: (t) => opened.push(t) };
      const state = EditorState.create({
        doc: wikiDoc,
        extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin(identitySrc), linkClickHandler, wikiLinkHost.of(host)],
      });
      const view = new EditorView({ state, parent: document.body });
      vi.spyOn(view, "posAtCoords").mockReturnValue(pointerPos);
      return view;
    }

    it("opens the note on a Ctrl+click, and nothing on a plain click", () => {
      const opened: string[] = [];
      const view = mountWiki(wikiDoc.indexOf("Known"), opened);
      expect(runHandler(view, {})).toEqual({ handled: false, prevented: false });
      expect(runHandler(view, { ctrlKey: true }).handled).toBe(true);
      expect(opened).toEqual(["Known"]);
      view.destroy();
    });

    it("ignores a wiki link inside inline code", () => {
      const opened: string[] = [];
      const view = mountWiki(wikiDoc.indexOf("Code"), opened);
      expect(runHandler(view, { ctrlKey: true }).handled).toBe(false);
      expect(opened).toEqual([]);
      view.destroy();
    });
  });

  it("does not open anything on a plain click", async () => {
    const view = mountLink(doc, onLinkText);
    expect(runHandler(view, {})).toEqual({ handled: false, prevented: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(openUrl).not.toHaveBeenCalled();
    view.destroy();
  });

  it("does not open anything on a right-click with Cmd or Ctrl held", async () => {
    const view = mountLink(doc, onLinkText);
    expect(runHandler(view, { metaKey: true, button: 2 })).toEqual({ handled: false, prevented: false });
    expect(runHandler(view, { ctrlKey: true, button: 2 })).toEqual({ handled: false, prevented: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(openUrl).not.toHaveBeenCalled();
    view.destroy();
  });

  it("does not open anything on Cmd+click outside a link or on a relative link", async () => {
    // IS_MAC true so the modifier gate itself passes, exercising the
    // link-lookup logic below it rather than the platform gate.
    platformMock.IS_MAC = true;
    const outside = mountLink(doc, 1);
    expect(runHandler(outside, { metaKey: true })).toEqual({ handled: false, prevented: false });
    outside.destroy();
    const relative = "see [notes](./notes.md) here\n";
    const rel = mountLink(relative, relative.indexOf("notes"));
    expect(runHandler(rel, { metaKey: true })).toEqual({ handled: false, prevented: false });
    rel.destroy();
    await new Promise((r) => setTimeout(r, 20));
    expect(openUrl).not.toHaveBeenCalled();
    platformMock.IS_MAC = false;
  });
});
