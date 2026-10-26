import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@/modules/actions/lib/types";
import type { DetectedEditor } from "./types";

const h = vi.hoisted(() => ({
  scan: vi.fn(),
  claim: vi.fn(),
  writes: [] as Action[][],
  failActions: false,
  failFlag: false,
  failAppActions: false,
  hydration: Promise.resolve() as Promise<void>,
}));

vi.mock("@/lib/native", () => ({ native: { editorScan: h.scan, claimStartupScan: h.claim } }));

vi.mock("@/modules/settings/preferences", async () => {
  const { create } = await import("zustand");
  return {
    usePreferencesStore: create(() => ({
      actions: [] as Action[],
      seededAgents: [] as string[],
      appActionsSeeded: false,
      detectedEditors: [] as DetectedEditor[],
    })),
    whenHydrated: () => h.hydration,
  };
});

vi.mock("@/modules/settings/store", async () => {
  const { usePreferencesStore } = await import("@/modules/settings/preferences");
  return {
    setDetectedEditors: async (v: DetectedEditor[]) => usePreferencesStore.setState({ detectedEditors: v }),
    setGlobalActions: async (v: Action[]) => {
      await Promise.resolve();
      if (h.failActions) throw new Error("disk");
      if (h.failAppActions && v.some((a) => a.kind === "app")) throw new Error("disk");
      h.writes.push(v);
      usePreferencesStore.setState({ actions: v });
    },
    setAppActionsSeeded: async (v: boolean) => {
      usePreferencesStore.setState({ appActionsSeeded: v });
    },
    setSeededAgents: async (v: string[]) => {
      if (h.failFlag) throw new Error("disk");
      usePreferencesStore.setState({ seededAgents: v });
    },
  };
});

import { usePreferencesStore } from "@/modules/settings/preferences";
import { globalActions } from "@/modules/actions/lib/globalActionsBinding";
import { runEditorScan, runStartupEditorScan } from "./useExternalEditors";

const agent = (id: string, enabled?: boolean): DetectedEditor => ({
  id,
  name: id,
  binary: id,
  argsBeforePath: [],
  kind: "agent",
  enabled,
});

const seededCommands = () => usePreferencesStore.getState().actions.map((a) => a.command);

beforeEach(() => {
  h.scan.mockReset();
  h.claim.mockReset();
  h.writes.length = 0;
  h.failActions = false;
  h.failFlag = false;
  h.failAppActions = false;
  h.hydration = Promise.resolve();
  usePreferencesStore.setState({ actions: [], seededAgents: [], appActionsSeeded: false, detectedEditors: [] });
});

describe("agent seeding on scan", () => {
  it("seeds global agent Actions and records the agents", async () => {
    h.scan.mockResolvedValue([agent("opencode"), agent("pi")]);
    await runEditorScan();
    expect(seededCommands().sort()).toEqual(["opencode", "pi"]);
    expect(usePreferencesStore.getState().seededAgents.sort()).toEqual(["opencode", "pi"]);
  });

  it("does not seed again after the Actions are deleted", async () => {
    h.scan.mockResolvedValue([agent("opencode")]);
    await runEditorScan();
    usePreferencesStore.setState({ actions: [] });
    await runEditorScan();
    expect(seededCommands()).toEqual([]);
  });

  it("records nothing when no agents are found", async () => {
    h.scan.mockResolvedValue([]);
    await runEditorScan();
    expect(usePreferencesStore.getState().seededAgents).toEqual([]);
    expect(h.writes).toEqual([]);
  });

  it("does not seed a disabled agent nor record it", async () => {
    h.scan.mockResolvedValue([agent("opencode", false)]);
    usePreferencesStore.setState({ detectedEditors: [agent("opencode", false)] });
    await runEditorScan();
    expect(seededCommands()).toEqual([]);
    expect(usePreferencesStore.getState().seededAgents).toEqual([]);
  });

  it("runs one scan at a time in a window, so two calls at once seed once", async () => {
    h.scan.mockResolvedValue([agent("opencode")]);
    const add = vi.spyOn(globalActions, "add");
    await Promise.all([runEditorScan(), runEditorScan()]);
    expect(add).toHaveBeenCalledTimes(1);
    expect(seededCommands()).toEqual(["opencode"]);
    add.mockRestore();
  });

  it("records nothing when the Actions write fails", async () => {
    h.scan.mockResolvedValue([agent("opencode")]);
    h.failActions = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runEditorScan();
    expect(usePreferencesStore.getState().seededAgents).toEqual([]);
    expect(seededCommands()).toEqual([]);
  });

  it("records the agents only after the write succeeded", async () => {
    h.scan.mockResolvedValue([agent("opencode")]);
    let seenAtWrite: string[] | undefined;
    const add = vi.spyOn(globalActions, "add").mockImplementation(async (a) => {
      seenAtWrite = usePreferencesStore.getState().seededAgents;
      return a;
    });
    await runEditorScan();
    expect(seenAtWrite).toEqual([]);
    expect(usePreferencesStore.getState().seededAgents).toEqual(["opencode"]);
    add.mockRestore();
  });

  it("marks the agent seen without adding when its Action is already there", async () => {
    h.scan.mockResolvedValue([agent("opencode")]);
    await runEditorScan();
    usePreferencesStore.setState({ seededAgents: [] });
    await runEditorScan();
    expect(seededCommands()).toEqual(["opencode"]);
    expect(usePreferencesStore.getState().seededAgents).toEqual(["opencode"]);
  });

  it("offers an agent that was never seen when a later scan finds it, and never one the user deleted", async () => {
    h.scan.mockResolvedValue([agent("opencode")]);
    await runEditorScan();
    usePreferencesStore.setState({ actions: [] });
    h.scan.mockResolvedValue([agent("opencode"), agent("pi")]);
    await runEditorScan();
    expect(seededCommands()).toEqual(["pi"]);
    expect(usePreferencesStore.getState().seededAgents.sort()).toEqual(["opencode", "pi"]);
  });

  it("waits for hydration when the scan resolves first, and keeps the saved global Actions", async () => {
    const saved: Action = { id: "act-1", name: "Build", kind: "script", command: "pnpm build", ownButton: false };
    let hydrate!: () => void;
    h.hydration = new Promise<void>((r) => {
      hydrate = r;
    });
    h.scan.mockResolvedValue([agent("opencode")]);
    const run = runEditorScan();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(h.writes).toEqual([]);
    usePreferencesStore.setState({ actions: [saved], seededAgents: [] });
    hydrate();
    await run;
    expect(seededCommands()).toEqual(["pnpm build", "opencode"]);
  });

  it("does not reseed when the hydrated list says the agents were already seen", async () => {
    const saved: Action = { id: "act-1", name: "Build", kind: "script", command: "pnpm build", ownButton: false };
    let hydrate!: () => void;
    h.hydration = new Promise<void>((r) => {
      hydrate = r;
    });
    h.scan.mockResolvedValue([agent("opencode")]);
    const run = runEditorScan();
    await new Promise<void>((r) => setTimeout(r, 0));
    usePreferencesStore.setState({ actions: [saved], seededAgents: ["opencode"] });
    hydrate();
    await run;
    expect(h.writes).toEqual([]);
    expect(seededCommands()).toEqual(["pnpm build"]);
  });
});

const editor = (id: string): DetectedEditor => ({
  id,
  name: id,
  binary: id,
  argsBeforePath: [],
  kind: "editor",
});

const prefs = () => usePreferencesStore.getState();

describe("app seeding on scan", () => {
  it("seeds apps inside the combo and sets only the app flag", async () => {
    h.scan.mockResolvedValue([editor("zed")]);
    await runEditorScan();
    expect(prefs().actions).toHaveLength(1);
    expect(prefs().actions[0]).toMatchObject({ kind: "app", ownButton: false });
    expect(prefs().appActionsSeeded).toBe(true);
    expect(prefs().seededAgents).toEqual([]);
  });

  it("does not seed again after the app Actions are deleted", async () => {
    h.scan.mockResolvedValue([editor("zed")]);
    await runEditorScan();
    usePreferencesStore.setState({ actions: [] });
    await runEditorScan();
    expect(prefs().actions).toEqual([]);
  });

  it("seeds agents and leaves the app flag unset when there are no editors", async () => {
    h.scan.mockResolvedValue([agent("opencode")]);
    await runEditorScan();
    expect(prefs().seededAgents).toEqual(["opencode"]);
    expect(prefs().appActionsSeeded).toBe(false);
  });

  it("seeds an agent that shows up in a later scan", async () => {
    h.scan.mockResolvedValue([editor("zed")]);
    await runEditorScan();
    h.scan.mockResolvedValue([editor("zed"), agent("opencode")]);
    await runEditorScan();
    expect(seededCommands()).toContain("opencode");
    expect(prefs().seededAgents).toEqual(["opencode"]);
  });

  it("seeds only the apps when the agents were already seen, without touching the agents", async () => {
    usePreferencesStore.setState({ seededAgents: ["opencode"] });
    h.scan.mockResolvedValue([agent("opencode"), editor("zed")]);
    await runEditorScan();
    expect(prefs().actions.map((a) => a.kind)).toEqual(["app"]);
    expect(prefs().appActionsSeeded).toBe(true);
  });

  it("seeds agents and apps together, each marked", async () => {
    h.scan.mockResolvedValue([agent("opencode"), editor("zed")]);
    await runEditorScan();
    expect(prefs().actions.map((a) => [a.kind, a.ownButton]).sort()).toEqual([
      ["agent", true],
      ["app", false],
    ]);
    expect(prefs().seededAgents.length > 0 && prefs().appActionsSeeded).toBe(true);
  });

  it("keeps the app flag false when the apps write fails, and keeps the agents recorded", async () => {
    h.scan.mockResolvedValue([agent("opencode"), editor("zed")]);
    h.failAppActions = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runEditorScan();
    expect(prefs().seededAgents).toEqual(["opencode"]);
    expect(prefs().appActionsSeeded).toBe(false);
  });

  it("does not attempt the apps nor record anything when the agents write fails", async () => {
    h.scan.mockResolvedValue([agent("opencode"), editor("zed")]);
    h.failActions = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runEditorScan();
    expect(prefs().seededAgents).toEqual([]);
    expect(prefs().appActionsSeeded).toBe(false);
    expect(prefs().actions).toEqual([]);
  });

  it("sets the app flag only after the write succeeded", async () => {
    h.scan.mockResolvedValue([editor("zed")]);
    let flagAtWrite: boolean | undefined;
    const add = vi.spyOn(globalActions, "add").mockImplementation(async (a) => {
      flagAtWrite = prefs().appActionsSeeded;
      return a;
    });
    await runEditorScan();
    expect(flagAtWrite).toBe(false);
    expect(prefs().appActionsSeeded).toBe(true);
    add.mockRestore();
  });
});

describe("startup scan", () => {
  it("scans and seeds in the window that wins the claim", async () => {
    h.claim.mockResolvedValue(true);
    h.scan.mockResolvedValue([agent("opencode")]);
    await runStartupEditorScan();
    expect(h.scan).toHaveBeenCalledTimes(1);
    expect(seededCommands()).toEqual(["opencode"]);
  });

  it("does not scan nor seed in a window that loses the claim", async () => {
    h.claim.mockResolvedValue(false);
    h.scan.mockResolvedValue([agent("opencode")]);
    await runStartupEditorScan();
    expect(h.scan).not.toHaveBeenCalled();
    expect(seededCommands()).toEqual([]);
    expect(usePreferencesStore.getState().seededAgents).toEqual([]);
  });

  it("does not scan when the claim itself fails", async () => {
    h.claim.mockRejectedValue(new Error("ipc"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runStartupEditorScan();
    expect(h.scan).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
