// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AppearanceSection } from "./AppearanceSection";

vi.mock("@/modules/theme/ThemeProvider", () => ({
  useTheme: () => ({ resolvedMode: "dark" }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(AppearanceSection));
  });
  return {
    container,
    unmount: () => act(() => root.unmount()),
  };
}

describe("AppearanceSection font select", () => {
  // Radix's Select renders a blank trigger for an item whose value is "", so
  // the empty-string "Default" preset is mapped to a non-empty sentinel for
  // the shadcn Select alone; this locks that the label still shows up.
  it("shows the Default (Inter) label for the empty-string default preset", () => {
    const { container, unmount } = mount();
    expect(container.textContent).toContain("Default (Inter)");
    unmount();
  });
});
