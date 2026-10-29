import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  aliasAgentRecord,
  detachAgentSession,
  previewResumeCmd,
  type RestorePlan,
} from "@/modules/agents/lib/agentSessionRestore";

const makePlan = (tabId: string): RestorePlan => ({
  tabId,
  agent: "claude",
  resumeCmd: "claude --resume 'sess-1'",
  attemptedCmd: "",
  cwdLaunch: "/work",
  errorReason: "",
});

const calls = () => vi.mocked(invoke).mock.calls.map((c) => `${c[0]}:${(c[1] as { tabId: string }).tabId}`);

describe("record alias of a reopened tab", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("falls back to the old record while the new id has none", async () => {
    const plan = makePlan("old");
    vi.mocked(invoke).mockImplementation(async (_c, a) => ((a as { tabId?: string } | undefined)?.tabId === "old" ? plan : null));
    aliasAgentRecord("new-a", "old");
    expect(await previewResumeCmd("new-a")).toBe(plan);
    expect(calls()).toEqual(["agent_session_preview_cmd:new-a", "agent_session_preview_cmd:old"]);
  });

  it("releases the old record once the new id has its own", async () => {
    const own = makePlan("new-b");
    vi.mocked(invoke).mockResolvedValue(own);
    aliasAgentRecord("new-b", "old");
    expect(await previewResumeCmd("new-b")).toBe(own);
    expect(calls()).toContain("agent_detach_session:old");
    vi.mocked(invoke).mockClear();
    await previewResumeCmd("new-b");
    expect(calls()).toEqual(["agent_session_preview_cmd:new-b"]);
  });

  it("detaching the new id detaches the old record too", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    aliasAgentRecord("new-c", "old");
    await detachAgentSession("new-c");
    expect(calls()).toEqual(["agent_detach_session:old", "agent_detach_session:new-c"]);
  });

  it("does nothing different for a tab without alias", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    expect(await previewResumeCmd("plain")).toBeNull();
    expect(calls()).toEqual(["agent_session_preview_cmd:plain"]);
  });
});
