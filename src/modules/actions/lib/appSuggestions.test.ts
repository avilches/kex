import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { CUSTOM_APP_SUGGESTION, agentSuggestionsFromDetected, suggestionsFromDetected } from "./appSuggestions";

const ed = (id: string, binary: string, argsBeforePath: string[] = [], enabled?: boolean): DetectedEditor => ({
  id,
  name: id,
  binary,
  argsBeforePath,
  kind: "editor",
  enabled,
});

describe("suggestionsFromDetected", () => {
  it("offers one entry per app and preset variable, alphabetically", () => {
    const list = suggestionsFromDetected([ed("pycharm", "pycharm"), ed("bbedit", "bbedit")]);
    expect(list.map((s) => s.key)).toEqual([
      "bbedit:filepath",
      "bbedit:workspace",
      "bbedit:cwd",
      "pycharm:workspace",
      "pycharm:cwd",
    ]);
    expect(list[0]).toMatchObject({
      appId: "bbedit",
      name: "BBEdit {filepath}",
      iconId: "bbedit",
      defaultCommand: "bbedit {filepath}",
    });
    expect(list[1]!.defaultCommand).toBe("bbedit {workspace}");
    expect(list[2]!.defaultCommand).toBe("bbedit {cwd}");
  });

  it("quotes binaries and arguments that hold spaces", () => {
    const list = suggestionsFromDetected([ed("pycharm", "open", ["-na", "PyCharm CE.app", "--args"])]);
    expect(list.find((s) => s.key === "pycharm:workspace")!.defaultCommand).toBe(
      "open -na 'PyCharm CE.app' --args {workspace}",
    );
    const [v] = suggestionsFromDetected([ed("vscode", "/Applications/Visual Studio Code.app/bin/code")]);
    expect(v!.defaultCommand).toBe("'/Applications/Visual Studio Code.app/bin/code' {filepath}");  });

  it("keeps braces and quotes in a path literal", () => {
    const [a] = suggestionsFromDetected([ed("vscode", "/a/{x}/code")]);
    expect(a!.defaultCommand).toBe("/a/{{x}}/code {filepath}");
    const [b] = suggestionsFromDetected([ed("vscode", "/it's here/code")]);
    expect(b!.defaultCommand).toBe(`"/it's here/code" {filepath}`);
  });

  it("skips disabled apps and keeps enabled ones", () => {
    const list = suggestionsFromDetected([ed("vscode", "code", [], false), ed("cursor", "cursor"), ed("zed", "zed", [], false)]);
    expect(list.map((s) => s.key)).toEqual(["cursor:filepath", "cursor:workspace", "cursor:cwd"]);
  });

  it("lets two actions share one app with different templates", () => {
    const variants = suggestionsFromDetected([ed("zed", "zed")]).filter((s) => s.appId === "zed");
    expect(variants[0]!.appId).toBe("zed");
    expect(new Set(variants.map((v) => v.defaultCommand)).size).toBe(variants.length);
  });

  it("falls back to the detected name for an app outside the catalog", () => {
    const [s] = suggestionsFromDetected([ed("mystery", "mystery")]);
    expect(s).toMatchObject({ name: "mystery {filepath}", defaultCommand: "mystery {filepath}" });
  });
});

describe("custom app", () => {
  it("has an empty command, no app id and the generic icon", () => {
    expect(CUSTOM_APP_SUGGESTION).toMatchObject({ name: "Custom app", defaultCommand: "", iconId: null });
    expect(CUSTOM_APP_SUGGESTION.appId).toBeUndefined();
  });
});

describe("agentSuggestionsFromDetected", () => {
  const ag = (id: string, binary: string, enabled?: boolean): DetectedEditor => ({
    id,
    name: "Claude Code",
    binary,
    argsBeforePath: [],
    kind: "agent",
    enabled,
  });

  it("offers workspace then context per enabled agent, with the bare binary as command", () => {
    const list = agentSuggestionsFromDetected([ag("claude", "/usr/local/bin/claude")]);
    expect(list.map((s) => [s.key, s.cwdMode])).toEqual([
      ["claude:workspace", "workspace"],
      ["claude:context", "context"],
    ]);
    expect(list[0]).toMatchObject({ kind: "agent", appId: "claude", iconId: "claude", name: "Claude Code", defaultCommand: "claude" });
    expect(list.every((s) => !/[{}]/.test(s.defaultCommand + s.name))).toBe(true);
  });

  it("skips disabled agents", () => {
    expect(agentSuggestionsFromDetected([ag("claude", "claude", false)])).toEqual([]);
  });
});
