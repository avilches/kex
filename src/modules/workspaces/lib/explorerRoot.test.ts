import { describe, expect, it } from "vitest";
import { resolveActiveExplorerRoot, resolveOpenRoot } from "./explorerRoot";

describe("resolveOpenRoot", () => {
  it("devuelve explorerRoot cuando el fichero esta dentro", () => {
    expect(resolveOpenRoot("/proj", "/proj/src/a.ts")).toBe("/proj");
  });
  it("devuelve la carpeta padre cuando el fichero esta fuera del root", () => {
    expect(
      resolveOpenRoot("/proj", "/home/u/.config/kex/themes/x.json"),
    ).toBe("/home/u/.config/kex/themes");
  });
  it("devuelve la carpeta padre cuando no hay root ambiental", () => {
    expect(resolveOpenRoot(null, "/proj/src/a.ts")).toBe("/proj/src");
  });
  it("trata el propio root como dentro", () => {
    expect(resolveOpenRoot("/proj", "/proj")).toBe("/proj");
  });
  it("no trata un prefijo hermano como dentro", () => {
    expect(resolveOpenRoot("/proj", "/projOther/a.ts")).toBe("/projOther");
  });
  it("normaliza backslashes antes de comparar", () => {
    expect(resolveOpenRoot("C:/proj", "C:\\proj\\src\\a.ts")).toBe("C:/proj");
  });
});

describe("resolveActiveExplorerRoot", () => {
  it("usa el explorerRoot del panel para un editor activo", () => {
    expect(
      resolveActiveExplorerRoot({ kind: "editor", explorerRoot: "/a" }, "/b"),
    ).toBe("/a");
  });
  it("usa el explorerRoot del panel para un markdown activo", () => {
    expect(
      resolveActiveExplorerRoot({ kind: "markdown", explorerRoot: "/a" }, "/b"),
    ).toBe("/a");
  });
  it("usa la carpeta del fichero cuando el editor no tiene explorerRoot", () => {
    expect(
      resolveActiveExplorerRoot({ kind: "editor", path: "/x/y/a.ts" }, "/b"),
    ).toBe("/x/y");
  });
  it("usa la carpeta del fichero cuando el markdown no tiene explorerRoot", () => {
    expect(
      resolveActiveExplorerRoot({ kind: "markdown", path: "/x/y/r.md" }, "/b"),
    ).toBe("/x/y");
  });
  it("cae al ambiental para un editor sin explorerRoot ni path", () => {
    expect(resolveActiveExplorerRoot({ kind: "editor" }, "/b")).toBe("/b");
  });
  it("cae al ambiental para un panel de terminal", () => {
    expect(resolveActiveExplorerRoot({ kind: "terminal" }, "/b")).toBe("/b");
  });
  it("cae al ambiental cuando no hay panel activo", () => {
    expect(resolveActiveExplorerRoot(null, "/b")).toBe("/b");
  });
});
