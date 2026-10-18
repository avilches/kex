import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<Record<string, unknown>> = [];
let sendDelayMs = 0;

vi.mock("node:net", () => ({
  default: {
    connect: () => {
      const handlers: Record<string, () => void> = {};
      return {
        on: (name: string, fn: () => void) => {
          handlers[name] = fn;
          if (name === "connect") setTimeout(fn, sendDelayMs);
        },
        end: (data: string, cb: () => void) => {
          sent.push(JSON.parse(data));
          cb();
        },
        destroy: () => {},
      };
    },
  },
}));

type Event = { type: string; properties: Record<string, unknown> };
type Handler = (input: { event: Event }) => Promise<void>;

const PLUGIN = resolve(process.cwd(), "src-tauri/src/modules/agent/plugins/opencode-session.js");

async function load(sessions: Record<string, { parentID?: string }> = {}): Promise<Handler> {
  process.env.KEX_IPC = "/tmp/kex-test.sock";
  process.env.KEX_TAB_ID = "tab-1";
  const mod = (await import(/* @vite-ignore */ PLUGIN)) as {
    KexSessionPlugin: (ctx: unknown) => Promise<{ event: Handler }>;
  };
  const client = {
    session: {
      get: async ({ path }: { path: { id: string } }) => ({ data: { id: path.id, ...sessions[path.id] } }),
    },
  };
  return (await mod.KexSessionPlugin({ client })).event;
}

const status = (sessionID: string, type: string): Event => ({
  type: "session.status",
  properties: { sessionID, status: { type } },
});
const idle = (sessionID: string): Event => ({ type: "session.idle", properties: { sessionID } });
const created = (id: string, extra: Record<string, unknown> = {}): Event => ({
  type: "session.created",
  properties: { info: { id, directory: "/work", ...extra } },
});
const kinds = () => sent.map((f) => f.hook_event_name);

beforeEach(() => {
  sent.length = 0;
  sendDelayMs = 0;
  vi.resetModules();
});

describe("opencode plugin", () => {
  it("does nothing outside a Kex terminal", async () => {
    delete process.env.KEX_IPC;
    const mod = (await import(/* @vite-ignore */ PLUGIN)) as {
      KexSessionPlugin: (ctx: unknown) => Promise<Record<string, unknown>>;
    };
    expect(await mod.KexSessionPlugin({ client: {} })).toEqual({});
  });

  it("reports a new session, its turn and its end", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: status("ses_a", "busy") });
    await event({ event: status("ses_a", "idle") });
    await event({ event: idle("ses_a") });
    expect(kinds()).toEqual(["SessionStart", "UserPromptSubmit", "Stop"]);
    expect(sent[0]).toMatchObject({ agent: "opencode", session_id: "ses_a", cwd: "/work" });
  });

  it("registers a resumed session on its first busy event, which has no session.created", async () => {
    const event = await load();
    await event({ event: status("ses_old", "busy") });
    await event({ event: idle("ses_old") });
    expect(kinds()).toEqual(["SessionStart", "UserPromptSubmit", "Stop"]);
  });

  it("does not lose the Stop of a turn that ends while the session is still registering", async () => {
    sendDelayMs = 20;
    const event = await load();
    const busy = event({ event: status("ses_fast", "busy") });
    await event({ event: status("ses_fast", "idle") });
    await busy;
    expect(kinds()).toEqual(["SessionStart", "UserPromptSubmit", "Stop"]);
  });

  it("sends one Stop for the two idle events of a turn", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: status("ses_a", "busy") });
    await Promise.all([event({ event: status("ses_a", "idle") }), event({ event: idle("ses_a") })]);
    expect(kinds().filter((k) => k === "Stop")).toHaveLength(1);
  });

  it("never makes a subagent the session of the tab, created or resumed", async () => {
    const event = await load({ ses_resumed_child: { parentID: "ses_a" } });
    await event({ event: created("ses_a") });
    await event({ event: created("ses_child", { parentID: "ses_a" }) });
    await event({ event: status("ses_child", "busy") });
    await event({ event: status("ses_resumed_child", "busy") });
    expect(kinds().filter((k) => k === "SessionStart" || k === "UserPromptSubmit")).toEqual(["SessionStart"]);
    expect(sent.every((f) => f.session_id === "ses_a")).toBe(true);
  });

  it("raises the main session's attention when a subagent asks for a permission", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: created("ses_child", { parentID: "ses_a" }) });
    await event({
      event: { type: "permission.asked", properties: { sessionID: "ses_child", permission: "bash" } },
    });
    expect(sent[sent.length - 1]).toMatchObject({
      hook_event_name: "PermissionRequest",
      session_id: "ses_a",
      tool_name: "bash",
    });
  });

  it("re-records the session the user switches back to, and keeps a second session in the same process", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: created("ses_b") });
    await event({ event: status("ses_a", "busy") });
    const starts = sent.filter((f) => f.hook_event_name === "SessionStart");
    expect(starts.map((f) => f.session_id)).toEqual(["ses_a", "ses_b", "ses_a"]);
    expect(starts.map((f) => f.source)).toEqual(["startup", "resume", "resume"]);
  });

  it("treats a user abort as the end of the turn, not as a failure", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: status("ses_a", "busy") });
    await event({
      event: { type: "session.error", properties: { sessionID: "ses_a", error: { name: "MessageAbortedError" } } },
    });
    await event({ event: idle("ses_a") });
    expect(kinds()).toEqual(["SessionStart", "UserPromptSubmit", "Stop"]);
  });

  it("reports a real error as StopFailure and then stays quiet on idle", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: status("ses_a", "busy") });
    await event({
      event: {
        type: "session.error",
        properties: { sessionID: "ses_a", error: { name: "ApiError", data: { message: "boom" } } },
      },
    });
    await event({ event: idle("ses_a") });
    expect(kinds()).toEqual(["SessionStart", "UserPromptSubmit", "StopFailure"]);
    expect(sent[sent.length - 1]).toMatchObject({ error_message: "boom" });
  });

  it("ignores the high-volume events without sending anything", async () => {
    const event = await load();
    await event({ event: { type: "message.part.delta", properties: { sessionID: "ses_a" } } });
    await event({ event: { type: "message.updated", properties: { sessionID: "ses_a" } } });
    expect(sent).toEqual([]);
  });

  it("shows a subagent session as a row under the tab and removes it when it ends", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: status("ses_a", "busy") });
    await event({
      event: created("ses_child", { parentID: "ses_a", title: "Saludar usuario (@general subagent)", agent: "general" }),
    });
    await event({ event: status("ses_child", "busy") });
    await event({ event: idle("ses_child") });
    const subs = sent.filter((f) => String(f.hook_event_name).startsWith("Subagent"));
    expect(subs.map((f) => f.hook_event_name)).toEqual(["SubagentStart", "SubagentStop"]);
    expect(subs[0]).toMatchObject({
      session_id: "ses_a",
      agent_id: "ses_child",
      agent_type: "general",
      description: "Saludar usuario",
    });
    expect(subs[1]).toMatchObject({ session_id: "ses_a", agent_id: "ses_child" });
  });

  it("a subagent that ends never ends the turn of the main session", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: status("ses_a", "busy") });
    await event({ event: created("ses_child", { parentID: "ses_a", title: "x (@general subagent)", agent: "general" }) });
    await event({ event: status("ses_child", "idle") });
    expect(kinds()).not.toContain("Stop");
    await event({ event: idle("ses_a") });
    expect(kinds().filter((k) => k === "Stop")).toHaveLength(1);
  });

  it("a failing subagent closes its row and is not reported as a failure of the tab", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: created("ses_child", { parentID: "ses_a", title: "x (@general subagent)", agent: "general" }) });
    await event({
      event: { type: "session.error", properties: { sessionID: "ses_child", error: { name: "ApiError" } } },
    });
    expect(kinds()).toEqual(["SessionStart", "SubagentStart", "SubagentStop"]);
  });

  it("does not report a subagent whose parent the tab never showed", async () => {
    const event = await load();
    await event({ event: created("ses_child", { parentID: "ses_unknown", title: "x (@general subagent)" }) });
    expect(sent).toEqual([]);
  });

  it("reports one row per subagent for parallel subagents", async () => {
    const event = await load();
    await event({ event: created("ses_a") });
    await event({ event: created("ses_c1", { parentID: "ses_a", title: "uno (@general subagent)", agent: "general" }) });
    await event({ event: created("ses_c2", { parentID: "ses_a", title: "dos (@general subagent)", agent: "general" }) });
    await event({ event: idle("ses_c2") });
    await event({ event: idle("ses_c1") });
    const subs = sent.filter((f) => String(f.hook_event_name).startsWith("Subagent"));
    expect(subs.map((f) => `${f.hook_event_name}:${f.agent_id}`)).toEqual([
      "SubagentStart:ses_c1",
      "SubagentStart:ses_c2",
      "SubagentStop:ses_c2",
      "SubagentStop:ses_c1",
    ]);
  });
});
