// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { TextEntry } from "./entries";
import { locateEditable, observeOverrides, setOverrides } from "./reconcile";

const text = (original: string, edited: string): TextEntry => ({
  section: "general",
  kind: "text",
  original,
  edited,
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

function q<T extends Element>(selector: string): T {
  return document.querySelector(selector) as T;
}

afterEach(() => {
  setOverrides([], document.body);
  document.body.innerHTML = "";
});

describe("reconcile", () => {
  it("rewrites a matching text node and keeps surrounding whitespace", () => {
    const root = mount("<p> Hello </p><p>Other</p>");
    setOverrides([text("Hello", "Hi")], root);
    expect(root.innerHTML).toBe("<p> Hi </p><p>Other</p>");
  });

  it("restores the original when the entry goes away", () => {
    const root = mount("<p>Hello</p>");
    setOverrides([text("Hello", "Hi")], root);
    setOverrides([], root);
    expect(root.textContent).toBe("Hello");
  });

  it("applies a later edit of the same original over the previous one", () => {
    const root = mount("<p>Hello</p>");
    setOverrides([text("Hello", "Hi")], root);
    setOverrides([text("Hello", "Hey")], root);
    expect(root.textContent).toBe("Hey");
  });

  it("treats a node rewritten by React as a fresh original", () => {
    const root = mount("<p>Hello</p>");
    setOverrides([text("Hello", "Hi")], root);
    const node = q("p").firstChild as Text;
    node.nodeValue = "Goodbye";
    setOverrides([text("Hello", "Hi")], root);
    expect(root.textContent).toBe("Goodbye");
  });

  it("covers title and placeholder attributes", () => {
    const root = mount('<button title="Close"></button><input placeholder="Name" />');
    setOverrides(
      [
        { section: "general", kind: "title", original: "Close", edited: "Dismiss" },
        { section: "general", kind: "placeholder", original: "Name", edited: "Your name" },
      ],
      root,
    );
    expect(q<HTMLButtonElement>("button").getAttribute("title")).toBe("Dismiss");
    expect(q<HTMLInputElement>("input").getAttribute("placeholder")).toBe("Your name");
    setOverrides([], root);
    expect(q<HTMLButtonElement>("button").getAttribute("title")).toBe("Close");
  });

  it("re-applies to nodes added later through the observer", async () => {
    const root = mount("<div id='host'></div>");
    setOverrides([text("Hello", "Hi")], root);
    const stop = observeOverrides(root);
    q("#host").innerHTML = "<span>Hello</span>";
    await new Promise((r) => setTimeout(r, 0));
    stop();
    expect(q("span").textContent).toBe("Hi");
  });
});

describe("locateEditable", () => {
  it("returns the original of an already edited text", () => {
    const root = mount("<p>Hello</p>");
    setOverrides([text("Hello", "Hi")], root);
    const found = locateEditable(q("p"), 0, 0);
    expect(found).toEqual({ kind: "text", original: "Hello", current: "Hi" });
  });

  it("falls back to the title of an icon-only element", () => {
    mount('<button title="Close"><svg></svg></button>');
    const found = locateEditable(q("svg"), 0, 0);
    expect(found).toEqual({ kind: "title", original: "Close", current: "Close" });
  });

  it("ignores inputs so the native menu stays", () => {
    mount('<input placeholder="Name" />');
    expect(locateEditable(q<HTMLInputElement>("input"), 0, 0)).toBeNull();
  });
});
