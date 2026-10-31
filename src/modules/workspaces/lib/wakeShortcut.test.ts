// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { enterBelongsToFocusedElement, isWakeEnter } from "./wakeShortcut";

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

describe("isWakeEnter", () => {
  const key = (init: KeyboardEventInit, target: Element) => {
    const e = new KeyboardEvent("keydown", { key: "Enter", ...init });
    Object.defineProperty(e, "target", { value: target });
    return e;
  };

  it("wakes on a bare Enter over nothing in particular", () => {
    expect(isWakeEnter(key({}, mount("<div id=x></div>", "#x")))).toBe(true);
  });

  it("ignores a modified Enter, a repeat and other keys", () => {
    const el = mount("<div id=x></div>", "#x");
    expect(isWakeEnter(key({ metaKey: true }, el))).toBe(false);
    expect(isWakeEnter(key({ shiftKey: true }, el))).toBe(false);
    expect(isWakeEnter(key({ repeat: true }, el))).toBe(false);
    expect(isWakeEnter(key({ key: "a" }, el))).toBe(false);
  });

  it("leaves the key to the explorer", () => {
    expect(isWakeEnter(key({}, mount("<div data-file-explorer><span id=x></span></div>", "#x")))).toBe(false);
  });
});
