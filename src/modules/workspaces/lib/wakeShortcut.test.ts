// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { enterBelongsToFocusedElement } from "./wakeShortcut";

const mount = (html: string, selector: string): Element => {
  document.body.innerHTML = html;
  return document.querySelector(selector)!;
};

describe("enterBelongsToFocusedElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is free when nothing in particular has the focus", () => {
    expect(enterBelongsToFocusedElement(document.body)).toBe(false);
    expect(enterBelongsToFocusedElement(null)).toBe(false);
    expect(enterBelongsToFocusedElement(mount("<div id=x><span>hi</span></div>", "span"))).toBe(false);
  });

  it("belongs to fields, buttons, menus and dialogs", () => {
    expect(enterBelongsToFocusedElement(mount("<input>", "input"))).toBe(true);
    expect(enterBelongsToFocusedElement(mount("<button>go</button>", "button"))).toBe(true);
    expect(enterBelongsToFocusedElement(mount("<div role=menu><div id=i tabindex=0></div></div>", "#i"))).toBe(true);
    expect(enterBelongsToFocusedElement(mount("<div role=dialog><span>x</span></div>", "span"))).toBe(true);
  });

  it("belongs to the editor and the explorer rows", () => {
    expect(enterBelongsToFocusedElement(mount("<div class=cm-editor><div class=cm-content></div></div>", ".cm-content"))).toBe(true);
    expect(enterBelongsToFocusedElement(mount("<div role=tree><div role=treeitem id=r></div></div>", "#r"))).toBe(true);
  });

  it("does not belong to the terminal input, which is a textarea but has no terminal behind", () => {
    const el = mount("<div class=xterm><textarea class=xterm-helper-textarea></textarea></div>", "textarea");
    expect(enterBelongsToFocusedElement(el)).toBe(false);
  });
});
