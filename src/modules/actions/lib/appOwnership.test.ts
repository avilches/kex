import { describe, expect, it } from "vitest";
import { updateAction } from "./actions";
import { ownedAfterEdit } from "./appOwnership";
import { presetOf, uninstalledSuggestions, type AppSuggestion } from "./appSuggestions";
import type { Action } from "./types";

const preset: Action = {
  id: "a",
  name: "Sublime Text {workspace}",
  command: "subl {workspace}",
  kind: "app",
  appId: "sublime",
  ownButton: false,
};

const sublime: AppSuggestion = { key: "sublime:ws", appId: "sublime", name: "Sublime Text {workspace}", iconId: "sublime", defaultCommand: "subl {workspace}", kind: "app" };
const zed: AppSuggestion = { key: "zed:ws", appId: "zed", name: "Zed {workspace}", iconId: "zed", defaultCommand: "zed {workspace}", kind: "app" };
const presets = [sublime, zed];

// What the store keeps after an edit, the way Settings applies it.
const apply = (list: Action[], next: Action): Action[] => updateAction(list, next.id, next);

describe("ownedAfterEdit", () => {
  it("makes a preset the user's own when its command changes, keeping the icon", () => {
    const edited = ownedAfterEdit(preset, { ...preset, command: "subl -n {workspace}" }, presets);
    expect(edited).toMatchObject({ appId: "", iconId: "sublime" });
    const stored = apply([preset], edited)[0]!;
    expect(stored.appId).toBeUndefined();
    expect(stored.iconId).toBe("sublime");
  });

  it("never lets a rename or the own-button choice change it", () => {
    expect(ownedAfterEdit(preset, { ...preset, name: "My Sublime" }, presets).appId).toBe("sublime");
    expect(ownedAfterEdit(preset, { ...preset, ownButton: true }, presets).appId).toBe("sublime");
    expect(ownedAfterEdit(preset, { ...preset, command: "subl {workspace} " }, presets).appId).toBe("sublime");
  });

  it("gives the link back when the command is the preset's again, whatever the name", () => {
    const own = apply([preset], ownedAfterEdit(preset, { ...preset, command: "subl -n {workspace}" }, presets))[0]!;
    const back = ownedAfterEdit(own, { ...own, command: "subl {workspace}", name: "Anything" }, presets);
    expect(back).toMatchObject({ appId: "sublime", iconId: "" });
    const stored = apply([own], back)[0]!;
    expect(stored.appId).toBe("sublime");
    expect(stored.iconId).toBeUndefined();
  });

  it("does not link to another app's preset, nor without a preset list", () => {
    const own: Action = { ...preset, appId: undefined, iconId: "sublime", command: "subl -n {workspace}" };
    expect(ownedAfterEdit(own, { ...own, command: "zed {workspace}" }, presets).appId).toBeUndefined();
    expect(ownedAfterEdit(own, { ...own, command: "subl {workspace}" }).appId).toBeUndefined();
  });

  it("leaves an action that is not an app of a preset alone", () => {
    const own: Action = { ...preset, appId: undefined };
    expect(ownedAfterEdit(own, { ...own, command: "x" }, presets)).toEqual({ ...own, command: "x" });
  });
});

describe("an edited preset and the Add combo", () => {
  it("is offered again once its command changes, and not before", () => {
    expect(uninstalledSuggestions([sublime], [preset])).toEqual([]);
    const stored = apply([preset], ownedAfterEdit(preset, { ...preset, command: "subl -n {workspace}" }, presets));
    expect(uninstalledSuggestions([sublime], stored)).toEqual([sublime]);
  });

  it("is not offered again by a rename, and is hidden again when the command comes back", () => {
    const renamed = apply([preset], ownedAfterEdit(preset, { ...preset, name: "My Sublime" }, presets));
    expect(uninstalledSuggestions([sublime], renamed)).toEqual([]);
    const own = apply([preset], ownedAfterEdit(preset, { ...preset, command: "subl -n {workspace}" }, presets));
    const back = apply(own, ownedAfterEdit(own[0]!, { ...own[0]!, command: "subl {workspace}" }, presets));
    expect(uninstalledSuggestions([sublime], back)).toEqual([]);
  });
});

describe("presetOf", () => {
  it("finds the preset of an app by its command alone", () => {
    expect(presetOf({ kind: "app", command: " subl {workspace} " }, presets)).toBe(sublime);
    expect(presetOf({ kind: "app", command: "subl" }, presets)).toBeUndefined();
    expect(presetOf({ kind: "script", command: "subl {workspace}" }, presets)).toBeUndefined();
  });
});

describe("agent presets", () => {
  const agentWs: AppSuggestion = { key: "claude:workspace", appId: "claude", name: "Claude Code", iconId: "claude", defaultCommand: "claude", kind: "agent", cwdMode: "workspace" };
  const agentCtx: AppSuggestion = { ...agentWs, key: "claude:context", cwdMode: "context" };
  const agents = [agentWs, agentCtx];
  const installed: Action = { id: "g", name: "Claude Code", command: "claude", kind: "agent", appId: "claude", cwdMode: "context", ownButton: false };

  it("offers the other variant while one is installed", () => {
    expect(uninstalledSuggestions(agents, [installed])).toEqual([agentWs]);
  });

  it("never matches across kinds", () => {
    const app: Action = { ...installed, kind: "app", cwdMode: undefined };
    expect(uninstalledSuggestions(agents, [app])).toEqual(agents);
    expect(uninstalledSuggestions([sublime], [{ ...preset, kind: "agent" }])).toEqual([sublime]);
    expect(presetOf(installed, agents)).toBe(agentCtx);
    expect(presetOf({ kind: "app", command: "claude" }, agents)).toBeUndefined();
  });

  it("owns an edited command or start folder, and gives the link back on restore", () => {
    const edited = ownedAfterEdit(installed, { ...installed, command: "claude --model opus" }, agents);
    expect(edited).toMatchObject({ appId: "", iconId: "claude" });
    const own = apply([installed], edited)[0]!;
    expect(uninstalledSuggestions(agents, [own])).toEqual(agents);
    const back = ownedAfterEdit(own, { ...own, command: "claude" }, agents);
    expect(back).toMatchObject({ appId: "claude", iconId: "" });
    expect(ownedAfterEdit(installed, { ...installed, cwdMode: "workspace" }, agents)).toMatchObject({ appId: "claude" });
  });

  it("relinks by start folder and keeps the user's name and own-button choice", () => {
    const mine: Action = { ...installed, name: "My Claude", ownButton: true, appId: "", iconId: "claude", cwdMode: "fixed", cwd: "/x" };
    const relinked = ownedAfterEdit(mine, { ...mine, cwdMode: "workspace", cwd: undefined }, agents);
    expect(relinked).toMatchObject({ appId: "claude", iconId: "", name: "My Claude", ownButton: true, cwdMode: "workspace" });
    expect(presetOf(relinked, agents)).toBe(agentWs);
    const moved = ownedAfterEdit(installed, { ...installed, name: "Mine", ownButton: true, cwdMode: "workspace" }, agents);
    expect(moved).toMatchObject({ appId: "claude", name: "Mine", ownButton: true, cwdMode: "workspace" });
  });

  it("an agent preset cannot be built without its start folder", () => {
    // @ts-expect-error an agent suggestion must carry cwdMode
    const missing: AppSuggestion = { key: "k", appId: "claude", name: "C", iconId: "claude", defaultCommand: "claude", kind: "agent" };
    expect(missing.kind).toBe("agent");
  });
});
