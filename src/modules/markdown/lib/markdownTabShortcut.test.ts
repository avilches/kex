// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { routeMarkdownShortcut } from "@/modules/markdown/lib/markdownTabShell";
import { type KeyBinding, SHORTCUTS } from "@/modules/shortcuts/shortcuts";

function bindingToEventInit(binding: KeyBinding): KeyboardEventInit {
  return {
    key: binding.key,
    ctrlKey: !!binding.ctrl,
    shiftKey: !!binding.shift,
    altKey: !!binding.alt,
    metaKey: !!binding.meta,
  };
}

// Build a synthetic event from the registry's own default binding, so the test
// keeps passing when a default changes and fails if an id disappears.
function eventFor(id: string): KeyboardEvent {
  const entry = SHORTCUTS.find((s) => s.id === id);
  if (!entry) throw new Error(`unknown shortcut id: ${id}`);
  const binding = entry.defaultBindings[0];
  return new KeyboardEvent("keydown", bindingToEventInit(binding));
}

describe("routeMarkdownShortcut", () => {
  it("routes the save shortcut", () => {
    expect(routeMarkdownShortcut(eventFor("editor.save"), {}, true)).toBe("save");
  });

  it("routes the source toggle", () => {
    expect(routeMarkdownShortcut(eventFor("markdown.toggleSource"), {}, true)).toBe(
      "toggleSource",
    );
  });

  it("routes the outline toggle only when the caller supports it", () => {
    const e = eventFor("markdown.toggleOutline");
    expect(routeMarkdownShortcut(e, {}, true)).toBe("toggleOutline");
    expect(routeMarkdownShortcut(e, {}, false)).toBe(null);
  });

  it("returns null for an unrelated key", () => {
    expect(routeMarkdownShortcut(new KeyboardEvent("keydown", { key: "q" }), {}, true)).toBe(
      null,
    );
  });
});
