import { describe, expect, it } from "vitest";
import { normalizeActions } from "./actions";

// What a user's disk holds from before the model changed: every field the old code wrote.
const OLD_DISK = [
  { id: "ac-1", name: "Dev {cwd}", kind: "script", command: "pnpm dev {cwd}", cwdMode: "context", ownButton: true },
  { id: "ac-2", name: "Deploy", kind: "script", command: "make deploy", cwdMode: "fixed", cwd: "/srv/app", ownButton: false },
  { id: "ac-3", name: "Home script", kind: "script", command: "ls", ownButton: false },
  { id: "ac-4", name: "Zed", kind: "app", command: "zed {target}", appId: "zed", iconId: "zed", accepts: "both", ownButton: true },
  { id: "ac-5", name: "Claude", kind: "agent", command: "claude", appId: "claude", cwdMode: "workspace", ownButton: true },
];

describe("loading Actions saved by the previous version", () => {
  it("drops every script, because none of them says where it runs, and keeps the rest", () => {
    const loaded = normalizeActions(OLD_DISK);
    expect(loaded.map((a) => a.id)).toEqual(["ac-4", "ac-5"]);
  });

  it("does not throw, and the kept ones carry no field of the old model", () => {
    for (const a of normalizeActions(OLD_DISK)) {
      for (const gone of ["appId", "iconId", "cwdMode", "runs"] as const) {
        expect(a, `${a.id}.${gone}`).not.toHaveProperty(gone);
      }
    }
  });

  it("forces an app's own button off, as the new rule says, and keeps an agent's", () => {
    const [app, agent] = normalizeActions(OLD_DISK);
    expect(app!.ownButton).toBe(false);
    expect(agent!.ownButton).toBe(true);
  });

  it("loses the icon of an old app, since the icon field is the only identity now", () => {
    const [app] = normalizeActions(OLD_DISK);
    expect(app!.icon).toBeUndefined();
  });
});
