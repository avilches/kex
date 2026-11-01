// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({ mode: "dark", setMode: vi.fn() }));
vi.mock("@/modules/theme", () => ({ useTheme: () => theme }));

import { ThemeModeSelector } from "./ThemeModeSelector";

afterEach(() => {
  cleanup();
  theme.setMode.mockClear();
});

describe("ThemeModeSelector", () => {
  it("is a radio group that announces the selected mode", () => {
    render(<ThemeModeSelector />);
    expect(screen.getByRole("radiogroup", { name: "Theme mode" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      ["System", "false"],
      ["Light", "false"],
      ["Dark", "true"],
    ]);
  });

  it("changes the mode when one is chosen", () => {
    render(<ThemeModeSelector />);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(theme.setMode).toHaveBeenCalledWith("light");
  });
});
