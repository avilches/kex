import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { CUSTOM_APP_SUGGESTION, actionFromSuggestion, agentSuggestionsFromDetected, suggestionsFromDetected } from "./appSuggestions";

const ed = (id: string, binary: string, argsBeforePath: string[] = [], enabled?: boolean): DetectedEditor => ({
  id,
  name: id,
  binary,
  argsBeforePath,
  kind: "editor",
  enabled,
});

describe("suggestionsFromDetected", () => {
  it("offers one entry per app, alphabetically, ending in {target}", () => {
    const list = suggestionsFromDetected([ed("pycharm", "pycharm"), ed("bbedit", "bbedit")]);
    expect(list.map((s) => s.key)).toEqual(["bbedit:app", "pycharm:app"]);
    expect(list[0]).toMatchObject({
      appId: "bbedit",
      name: "BBEdit",
      iconId: "bbedit",
      defaultCommand: "bbedit {target}",
      kind: "app",
    });
    expect(list[1]!.defaultCommand).toBe("pycharm {target}");
  });

  it("never offers the same app twice, whatever it accepts: no variable in the name or the command but {target}", () => {
    const list = suggestionsFromDetected([ed("zed", "zed"), ed("pycharm", "pycharm"), ed("vscode", "code")]);
    expect(list).toHaveLength(3);
    for (const s of list) {
      expect(s.name).not.toMatch(/[{}]/);
      expect(s.defaultCommand.match(/\{[a-z]+\}/g)).toEqual(["{target}"]);
    }
  });

  it("says what each app accepts from the catalog: JetBrains folders, the rest either, an unknown one a folder", () => {
    const by = Object.fromEntries(suggestionsFromDetected([ed("pycharm", "pycharm"), ed("zed", "zed"), ed("vscode", "code"), ed("mystery", "mystery")]).map((s) => [s.appId, s.accepts]));
    expect(by).toEqual({ pycharm: "folder", zed: "both", vscode: "both", mystery: "folder" });
  });

  it("quotes binaries and arguments that hold spaces", () => {
    const [p] = suggestionsFromDetected([ed("pycharm", "open", ["-na", "PyCharm CE.app", "--args"])]);
    expect(p!.defaultCommand).toBe("open -na 'PyCharm CE.app' --args {target}");
    const [v] = suggestionsFromDetected([ed("vscode", "/Applications/Visual Studio Code.app/bin/code")]);
    expect(v!.defaultCommand).toBe("'/Applications/Visual Studio Code.app/bin/code' {target}");
  });

  it("keeps braces and quotes in a path literal", () => {
    const [a] = suggestionsFromDetected([ed("vscode", "/a/{x}/code")]);
    expect(a!.defaultCommand).toBe("/a/{{x}}/code {target}");
    const [b] = suggestionsFromDetected([ed("vscode", "/it's here/code")]);
    expect(b!.defaultCommand).toBe(`"/it's here/code" {target}`);
  });

  it("skips disabled apps and keeps enabled ones", () => {
    const list = suggestionsFromDetected([ed("vscode", "code", [], false), ed("cursor", "cursor"), ed("zed", "zed", [], false)]);
    expect(list.map((s) => s.key)).toEqual(["cursor:app"]);
  });

  it("falls back to the detected name for an app outside the catalog", () => {
    const [s] = suggestionsFromDetected([ed("mystery", "mystery")]);
    expect(s).toMatchObject({ name: "mystery", defaultCommand: "mystery {target}", accepts: "folder" });
  });

  it("builds an Action that carries what the app accepts and no variable in its name", () => {
    const [s] = suggestionsFromDetected([ed("pycharm", "pycharm")]);
    expect(actionFromSuggestion(s!)).toMatchObject({ kind: "app", name: "PyCharm", command: "pycharm {target}", appId: "pycharm", accepts: "folder", ownButton: false });
    const [z] = suggestionsFromDetected([ed("zed", "zed")]);
    expect(actionFromSuggestion(z!).accepts).toBe("both");
  });
});

describe("custom app", () => {
  it("has an empty command, no app id and the generic icon", () => {
    expect(CUSTOM_APP_SUGGESTION).toMatchObject({ name: "Custom", defaultCommand: "", iconId: null });
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

  it("offers one preset per enabled agent, with the binary and its bypass switch as command", () => {
    const list = agentSuggestionsFromDetected([ag("claude", "/usr/local/bin/claude")]);
    expect(list.map((s) => s.key)).toEqual(["claude:agent"]);
    expect(list.every((s) => !("cwdMode" in s))).toBe(true);
    expect(list[0]).toMatchObject({ kind: "agent", appId: "claude", iconId: "claude", name: "Claude Code", defaultCommand: "claude --dangerously-skip-permissions" });
    expect(list.every((s) => !/[{}]/.test(s.defaultCommand + s.name))).toBe(true);
  });

  it("uses the agent id as the command, so a Windows binary gives no .exe", () => {
    const list = agentSuggestionsFromDetected([ag("claude", "C:\\Users\\me\\bin\\claude.exe")]);
    expect(list.map((s) => s.defaultCommand)).toEqual(["claude --dangerously-skip-permissions"]);
  });

  it("skips disabled agents", () => {
    expect(agentSuggestionsFromDetected([ag("claude", "claude", false)])).toEqual([]);
  });
});
