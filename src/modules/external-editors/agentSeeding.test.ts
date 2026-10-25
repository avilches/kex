import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@/modules/actions/lib/types";
import type { DetectedEditor } from "./types";

const h = vi.hoisted(() => ({
  scan: vi.fn(),
  claim: vi.fn(),
  writes: [] as Action[][],
  failActions: false,
  failFlag: false,
  hydration: Promise.resolve() as Promise<void>,
}));

vi.mock("@/lib/native", () => ({ native: { editorScan: h.scan, claimStartupScan: h.claim } }));

vi.mock("@/modules/settings/preferences", async () => {
  const { create } = await import("zustand");
  return {
    usePreferencesStore: create(() => ({
      actions: [] as Action[],
      agentActionsSeeded: false,
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
      h.writes.push(v);
      usePreferencesStore.setState({ actions: v });
    },
    setAgentActionsSeeded: async (v: boolean) => {
      if (h.failFlag) throw new Error("disk");
      usePreferencesStore.setState({ agentActionsSeeded: v });
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
  h.hydration = Promise.resolve();
  usePreferencesStore.setState({ actions: [], agentActionsSeeded: false, detectedEditors: [] });
});

describe("agent seeding on scan", () => {
  it("seeds global agent Actions and sets the flag", async () => {
    h.scan.mockResolvedValue([agent("claude"), agent("pi")]);
    await runEditorScan();
    expect(seededCommands().sort()).toEqual(["claude", "pi"]);
    expect(usePreferencesStore.getState().agentActionsSeeded).toBe(true);
  });

  it("does not seed again after the Actions are deleted", async () => {
    h.scan.mockResolvedValue([agent("claude")]);
    await runEditorScan();
    usePreferencesStore.setState({ actions: [] });
    await runEditorScan();
    expect(seededCommands()).toEqual([]);
  });

  it("leaves the flag unset when no agents are found", async () => {
    h.scan.mockResolvedValue([]);
    await runEditorScan();
    expect(usePreferencesStore.getState().agentActionsSeeded).toBe(false);
    expect(h.writes).toEqual([]);
  });

  it("does not seed a disabled agent nor set the flag for it", async () => {
    h.scan.mockResolvedValue([agent("claude", false)]);
    usePreferencesStore.setState({ detectedEditors: [agent("claude", false)] });
    await runEditorScan();
    expect(seededCommands()).toEqual([]);
    expect(usePreferencesStore.getState().agentActionsSeeded).toBe(false);
  });

  it("runs one scan at a time in a window, so two calls at once seed once", async () => {
    h.scan.mockResolvedValue([agent("claude")]);
    const add = vi.spyOn(globalActions, "add");
    await Promise.all([runEditorScan(), runEditorScan()]);
    expect(add).toHaveBeenCalledTimes(1);
    expect(seededCommands()).toEqual(["claude"]);
    add.mockRestore();
  });

  it("keeps the flag false when the Actions write fails", async () => {
    h.scan.mockResolvedValue([agent("claude")]);
    h.failActions = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runEditorScan();
    expect(usePreferencesStore.getState().agentActionsSeeded).toBe(false);
    expect(seededCommands()).toEqual([]);
  });

  it("sets the flag only after the write succeeded", async () => {
    h.scan.mockResolvedValue([agent("claude")]);
    let flagAtWrite: boolean | undefined;
    const add = vi.spyOn(globalActions, "add").mockImplementation(async (a) => {
      flagAtWrite = usePreferencesStore.getState().agentActionsSeeded;
      return a;
    });
    await runEditorScan();
    expect(flagAtWrite).toBe(false);
    expect(usePreferencesStore.getState().agentActionsSeeded).toBe(true);
    add.mockRestore();
  });

  it("marks seeded without adding when the Actions are already there", async () => {
    h.scan.mockResolvedValue([agent("claude")]);
    await runEditorScan();
    usePreferencesStore.setState({ agentActionsSeeded: false });
    await runEditorScan();
    expect(seededCommands()).toEqual(["claude"]);
    expect(usePreferencesStore.getState().agentActionsSeeded).toBe(true);
  });

  it("waits for hydration when the scan resolves first, and keeps the saved global Actions", async () => {
    const saved: Action = { id: "act-1", name: "Build", kind: "script", command: "pnpm build", ownButton: false };
    let hydrate!: () => void;
    h.hydration = new Promise<void>((r) => {
      hydrate = r;
    });
    h.scan.mockResolvedValue([agent("claude")]);
    const run = runEditorScan();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(h.writes).toEqual([]);
    usePreferencesStore.setState({ actions: [saved], agentActionsSeeded: false });
    hydrate();
    await run;
    expect(seededCommands()).toEqual(["pnpm build", "claude"]);
  });

  it("does not reseed when the hydrated flag says the agents were already seeded", async () => {
    const saved: Action = { id: "act-1", name: "Build", kind: "script", command: "pnpm build", ownButton: false };
    let hydrate!: () => void;
    h.hydration = new Promise<void>((r) => {
      hydrate = r;
    });
    h.scan.mockResolvedValue([agent("claude")]);
    const run = runEditorScan();
    await new Promise<void>((r) => setTimeout(r, 0));
    usePreferencesStore.setState({ actions: [saved], agentActionsSeeded: true });
    hydrate();
    await run;
    expect(h.writes).toEqual([]);
    expect(seededCommands()).toEqual(["pnpm build"]);
  });
});

describe("startup scan", () => {
  it("scans and seeds in the window that wins the claim", async () => {
    h.claim.mockResolvedValue(true);
    h.scan.mockResolvedValue([agent("claude")]);
    await runStartupEditorScan();
    expect(h.scan).toHaveBeenCalledTimes(1);
    expect(seededCommands()).toEqual(["claude"]);
  });

  it("does not scan nor seed in a window that loses the claim", async () => {
    h.claim.mockResolvedValue(false);
    h.scan.mockResolvedValue([agent("claude")]);
    await runStartupEditorScan();
    expect(h.scan).not.toHaveBeenCalled();
    expect(seededCommands()).toEqual([]);
    expect(usePreferencesStore.getState().agentActionsSeeded).toBe(false);
  });

  it("does not scan when the claim itself fails", async () => {
    h.claim.mockRejectedValue(new Error("ipc"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runStartupEditorScan();
    expect(h.scan).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
