import { describe, expect, it } from "vitest";
import { gitStatusHexColor } from "./gitStatusColor";

describe("gitStatusHexColor", () => {
  it("defaults to the dark palette", () => {
    expect(gitStatusHexColor("M", "vscode")).toBe("#E2C08D");
    expect(gitStatusHexColor("A", "vscode")).toBe("#81B88B");
  });

  it("uses a distinct, more saturated palette in light mode", () => {
    expect(gitStatusHexColor("M", "vscode", "light")).toBe("#C26A00");
    expect(gitStatusHexColor("A", "vscode", "light")).toBe("#1E8E3E");
    expect(gitStatusHexColor("A", "jetbrains", "light")).not.toBe(
      gitStatusHexColor("A", "jetbrains", "dark"),
    );
  });
});
