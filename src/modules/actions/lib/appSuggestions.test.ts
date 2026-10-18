import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { CUSTOM_APP_SUGGESTION, suggestionFor, suggestionsFromDetected } from "./appSuggestions";

const ed = (id: string, binary: string, argsBeforePath: string[] = [], enabled?: boolean): DetectedEditor => ({
  id,
  name: id,
  binary,
  argsBeforePath,
  enabled,
});

describe("suggestionsFromDetected", () => {
  it("targets the workspace for IDEs and the file for text editors", () => {
    const [py, bb] = suggestionsFromDetected([ed("pycharm", "pycharm"), ed("bbedit", "bbedit")]);
    expect(py).toMatchObject({ appId: "pycharm", name: "PyCharm", iconId: "pycharm", defaultCommand: "pycharm {workspace}" });
    expect(bb).toMatchObject({ appId: "bbedit", name: "BBEdit", defaultCommand: "bbedit {path}" });
  });

  it("quotes binaries and arguments that hold spaces", () => {
    const [s] = suggestionsFromDetected([
      ed("pycharm", "open", ["-na", "PyCharm CE.app", "--args"]),
    ]);
    expect(s!.defaultCommand).toBe("open -na 'PyCharm CE.app' --args {workspace}");
    const [v] = suggestionsFromDetected([ed("vscode", "/Applications/Visual Studio Code.app/bin/code")]);
    expect(v!.defaultCommand).toBe("'/Applications/Visual Studio Code.app/bin/code' {workspace}");
  });

  it("keeps braces and quotes in a path literal", () => {
    const [a] = suggestionsFromDetected([ed("vscode", "/a/{x}/code")]);
    expect(a!.defaultCommand).toBe("/a/{{x}}/code {workspace}");
    const [b] = suggestionsFromDetected([ed("vscode", "/it's here/code")]);
    expect(b!.defaultCommand).toBe(`"/it's here/code" {workspace}`);
  });

  it("offers the folder variant of the file editors that open folders, as a second entry", () => {
    const list = suggestionsFromDetected([ed("zed", "zed"), ed("bbedit", "bbedit")]);
    expect(list.map((s) => s.key)).toEqual(["zed", "bbedit", "zed:workspace"]);
    expect(list[2]).toMatchObject({ appId: "zed", name: "Zed (workspace)", iconId: "zed", defaultCommand: "zed {workspace}" });
  });

  it("skips disabled apps and keeps enabled ones", () => {
    const list = suggestionsFromDetected([ed("vscode", "code", [], false), ed("cursor", "cursor", [], true), ed("zed", "zed", [], false)]);
    expect(list.map((s) => s.key)).toEqual(["cursor"]);
  });

  it("lets two actions share one app with different templates", () => {
    const [a, b] = suggestionsFromDetected([ed("zed", "zed")]).filter((s) => s.appId === "zed");
    expect(a!.appId).toBe(b!.appId);
    expect(a!.defaultCommand).not.toBe(b!.defaultCommand);
  });

  it("falls back to the detected name for an app outside the catalog", () => {
    const [s] = suggestionsFromDetected([ed("mystery", "mystery")]);
    expect(s).toMatchObject({ name: "mystery", defaultCommand: "mystery {path}" });
  });
});

describe("suggestionFor", () => {
  it("returns the default suggestion of a detected app", () => {
    expect(suggestionFor("pycharm", [ed("pycharm", "pycharm")]).defaultCommand).toBe("pycharm {workspace}");
  });

  it("returns the custom app for no id or an app that is not detected", () => {
    expect(suggestionFor(undefined, [])).toBe(CUSTOM_APP_SUGGESTION);
    expect(suggestionFor("pycharm", [])).toBe(CUSTOM_APP_SUGGESTION);
  });

  it("the custom app has an empty command and the generic icon", () => {
    expect(CUSTOM_APP_SUGGESTION).toMatchObject({ defaultCommand: "", iconId: null });
    expect(CUSTOM_APP_SUGGESTION.appId).toBeUndefined();
  });
});
