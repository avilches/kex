import { describe, expect, it } from "vitest";
import { gitStatusHexColor } from "./gitStatusColor";

describe("gitStatusHexColor", () => {
  it("defaults to the dark palette", () => {
    expect(gitStatusHexColor("A", "vscode")).toBe(gitStatusHexColor("A", "vscode", "dark"));
  });

  it("uses a distinct palette in light mode", () => {
    expect(gitStatusHexColor("A", "vscode", "light")).not.toBe(gitStatusHexColor("A", "vscode", "dark"));
    expect(gitStatusHexColor("A", "jetbrains", "light")).not.toBe(
      gitStatusHexColor("A", "jetbrains", "dark"),
    );
  });
});
