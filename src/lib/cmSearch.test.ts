// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { viewSearchHandle } from "./cmSearch";

const views: EditorView[] = [];

function mount(doc: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc }), parent });
  views.push(view);
  return { view, handle: viewSearchHandle(() => view), parent };
}

const sel = (view: EditorView) => view.state.selection.main.from;

afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
  document.body.innerHTML = "";
});

describe("viewSearchHandle", () => {
  it("moves between matches without opening the native panel on a view with no search extension", () => {
    const { view, handle, parent } = mount("foo bar foo bar foo");
    handle.setQuery("foo");
    expect(sel(view)).toBe(0);
    handle.findNext("foo");
    expect(sel(view)).toBe(8);
    handle.findNext("foo");
    expect(sel(view)).toBe(16);
    handle.findNext("foo");
    expect(sel(view)).toBe(0);
    handle.findPrevious("foo");
    expect(sel(view)).toBe(16);
    expect(parent.querySelector(".cm-search")).toBeNull();
  });

  it("keeps navigating after the query was cleared and re-supplied by the caller", () => {
    const { view, handle, parent } = mount("a b a b a");
    handle.setQuery("a");
    handle.clearQuery();
    handle.findNext("a");
    expect(sel(view)).toBe(4);
    handle.findPrevious("a");
    expect(sel(view)).toBe(0);
    expect(parent.querySelector(".cm-search")).toBeNull();
  });

  it("does nothing for an empty query", () => {
    const { view, handle, parent } = mount("abc");
    handle.findNext("");
    handle.setQuery("");
    expect(sel(view)).toBe(0);
    expect(parent.querySelector(".cm-search")).toBeNull();
  });
});
