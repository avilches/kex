// @vitest-environment happy-dom
import { forceParsing, syntaxTreeAvailable } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleLinkMousedown,
  linkClickHandler,
  livePreviewPlugin,
} from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

const openUrl = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

function mount(doc: string, selection?: { anchor: number }) {
  const state = EditorState.create({
    doc,
    selection: selection ? { anchor: selection.anchor } : undefined,
    extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin],
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

  it("renders a real checkbox input for a task item", () => {
    const view = mount("- [ ] todo\n");
    const checkbox = view.dom.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    view.destroy();
  });

  it("toggles the underlying text when the checkbox is clicked", () => {
    const view = mount("- [ ] todo\n");
    const checkbox = view.dom.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.state.doc.toString()).toBe("- [x] todo\n");
    view.destroy();
  });

  it("reveals markers on every line holding a cursor and keeps other lines hidden", () => {
    const doc = "**one**\n**two**\n**three**\n";
    const state = EditorState.create({
      doc,
      selection: EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(18)]),
      extensions: [EditorState.allowMultipleSelections.of(true), markdown({ base: markdownLanguage }), livePreviewPlugin],
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

  it("never decorates the frontmatter block", () => {
    const view = mount("---\ntitle: **not bold**\n---\n# Real\n", { anchor: 0 });
    // The frontmatter's own ** stays literal; only "Real" (after the closing ---) is a heading.
    const bodyText = view.dom.textContent ?? "";
    expect(bodyText).toContain("title: **not bold**");
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
      extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin, linkClickHandler],
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

  it("opens the link URL on Cmd+click over the link text", async () => {
    const view = mountLink(doc, onLinkText);
    const event = mousedown(view, { metaKey: true });
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://example.com"));
    view.destroy();
  });

  it("opens the link URL on Ctrl+click too", async () => {
    const view = mountLink(doc, onLinkText);
    mousedown(view, { ctrlKey: true });
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://example.com"));
    view.destroy();
  });

  // CodeMirror's own mouse-selection handling also calls preventDefault on a
  // mousedown it receives, so the negative cases call the handler directly to
  // see exactly what this extension does.
  function runHandler(view: EditorView, init: MouseEventInit) {
    const event = new MouseEvent("mousedown", { cancelable: true, ...init });
    const handled = handleLinkMousedown(event, view);
    return { handled, prevented: event.defaultPrevented };
  }

  it("does not open anything on a plain click", async () => {
    const view = mountLink(doc, onLinkText);
    expect(runHandler(view, {})).toEqual({ handled: false, prevented: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(openUrl).not.toHaveBeenCalled();
    view.destroy();
  });

  it("does not open anything on Cmd+click outside a link or on a relative link", async () => {
    const outside = mountLink(doc, 1);
    expect(runHandler(outside, { metaKey: true })).toEqual({ handled: false, prevented: false });
    outside.destroy();
    const relative = "see [notes](./notes.md) here\n";
    const rel = mountLink(relative, relative.indexOf("notes"));
    expect(runHandler(rel, { metaKey: true })).toEqual({ handled: false, prevented: false });
    rel.destroy();
    await new Promise((r) => setTimeout(r, 20));
    expect(openUrl).not.toHaveBeenCalled();
  });
});
