import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { CUSTOM_APP_SUGGESTION, suggestionsFromDetected } from "./appSuggestions";

const ed = (id: string, binary: string, argsBeforePath: string[] = [], enabled?: boolean): DetectedEditor => ({
  id,
  name: id,
  binary,
  argsBeforePath,
  enabled,
});

describe("suggestionsFromDetected", () => {
  it("offers one entry per app and preset variable", () => {
    const list = suggestionsFromDetected([ed("pycharm", "pycharm")]);
    expect(list.map((s) => s.key)).toEqual(["pycharm:path", "pycharm:workspace", "pycharm:cwd"]);
    expect(list[1]).toMatchObject({
      appId: "pycharm",
      name: "PyCharm (workspace)",
      iconId: "pycharm",
      defaultCommand: "pycharm {workspace}",
    });
    expect(list[2]!.defaultCommand).toBe("pycharm {cwd}");
  });

  it("quotes binaries and arguments that hold spaces", () => {
    const list = suggestionsFromDetected([ed("pycharm", "open", ["-na", "PyCharm CE.app", "--args"])]);
    expect(list.find((s) => s.key === "pycharm:workspace")!.defaultCommand).toBe(
      "open -na 'PyCharm CE.app' --args {workspace}",
    );
    const [v] = suggestionsFromDetected([ed("vscode", "/Applications/Visual Studio Code.app/bin/code")]);
    expect(v!.defaultCommand).toBe("'/Applications/Visual Studio Code.app/bin/code' {path}");
  });

  it("keeps braces and quotes in a path literal", () => {
    const [a] = suggestionsFromDetected([ed("vscode", "/a/{x}/code")]);
    expect(a!.defaultCommand).toBe("/a/{{x}}/code {path}");
    const [b] = suggestionsFromDetected([ed("vscode", "/it's here/code")]);
    expect(b!.defaultCommand).toBe(`"/it's here/code" {path}`);
  });

  it("skips disabled apps and keeps enabled ones", () => {
    const list = suggestionsFromDetected([ed("vscode", "code", [], false), ed("cursor", "cursor"), ed("zed", "zed", [], false)]);
    expect(list.map((s) => s.key)).toEqual(["cursor:path", "cursor:workspace", "cursor:cwd"]);
  });

  it("lets two actions share one app with different templates", () => {
    const variants = suggestionsFromDetected([ed("zed", "zed")]).filter((s) => s.appId === "zed");
    expect(variants[0]!.appId).toBe("zed");
    expect(new Set(variants.map((v) => v.defaultCommand)).size).toBe(variants.length);
  });

  it("falls back to the detected name for an app outside the catalog", () => {
    const [s] = suggestionsFromDetected([ed("mystery", "mystery")]);
    expect(s).toMatchObject({ name: "mystery (path)", defaultCommand: "mystery {path}" });
  });
});

describe("custom app", () => {
  it("has an empty command, no app id and the generic icon", () => {
    expect(CUSTOM_APP_SUGGESTION).toMatchObject({ name: "Custom app", defaultCommand: "", iconId: null });
    expect(CUSTOM_APP_SUGGESTION.appId).toBeUndefined();
  });
});
