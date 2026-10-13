import { describe, expect, it } from "vitest";
import {
  applyExplorerSnapshots,
  applySidebarView,
  DEFAULT_WORKSPACE_SIDEBAR,
  restoreExplorerSnapshot,
  sanitizeWorkspaceSidebar,
  type ExplorerSnapshot,
} from "./sidebarSnapshot";
import type { Workspace } from "./types";

const snap = (over: Partial<ExplorerSnapshot> = {}): ExplorerSnapshot => ({
  expanded: [],
  selectedPath: null,
  scroll: null,
  ...over,
});

describe("restoreExplorerSnapshot", () => {
  it("returns an empty restore without a snapshot", () => {
    expect(restoreExplorerSnapshot(null, "/p")).toEqual({
      expanded: [],
      selectedPath: null,
      scrollTop: 0,
    });
  });

  it("keeps everything when the root is the same", () => {
    const r = restoreExplorerSnapshot(
      snap({
        expanded: ["/p/src", "/p/docs"],
        selectedPath: "/p/src/a.ts",
        scroll: { root: "/p", top: 120 },
      }),
      "/p",
    );
    expect(r.expanded).toEqual(["/p/src", "/p/docs"]);
    expect(r.selectedPath).toBe("/p/src/a.ts");
    expect(r.scrollTop).toBe(120);
  });

  it("when the root moves up, keeps all folders and opens the old root", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p/app/src"], scroll: { root: "/p/app", top: 50 } }),
      "/p",
    );
    expect(r.expanded).toEqual(["/p/app", "/p/app/src"]);
    expect(r.scrollTop).toBe(0);
  });

  it("when the root moves down, drops folders that are outside", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p/app/src", "/p/other"] }),
      "/p/app",
    );
    expect(r.expanded).toEqual(["/p/app/src"]);
  });

  it("restores nothing for an unrelated root and never throws", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p/src"], selectedPath: "/p/src/a.ts" }),
      "/elsewhere",
    );
    expect(r).toEqual({ expanded: [], selectedPath: null, scrollTop: 0 });
  });

  it("opens the parents of the selected file and ignores a selection outside the root", () => {
    const inside = restoreExplorerSnapshot(
      snap({ selectedPath: "/p/a/b/c.ts" }),
      "/p",
    );
    expect(inside.expanded).toEqual(["/p/a", "/p/a/b"]);
    const outside = restoreExplorerSnapshot(snap({ selectedPath: "/q/c.ts" }), "/p");
    expect(outside.selectedPath).toBeNull();
  });

  it("never lists the root itself as an open folder and has no duplicates", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p", "/p/a", "/p/a/b"], selectedPath: "/p/a/b/c.ts" }),
      "/p",
    );
    expect(r.expanded).toEqual(["/p/a", "/p/a/b"]);
  });
});

describe("sanitizeWorkspaceSidebar", () => {
  it("returns undefined for anything that is not an object", () => {
    expect(sanitizeWorkspaceSidebar(undefined)).toBeUndefined();
    expect(sanitizeWorkspaceSidebar("x")).toBeUndefined();
    expect(sanitizeWorkspaceSidebar(null)).toBeUndefined();
  });

  it("falls back to safe values for wrong types", () => {
    const s = sanitizeWorkspaceSidebar({
      view: "bogus",
      expanded: ["/a", 3, "", "/a", null],
      selectedPath: 7,
      scroll: { root: 1, top: "x" },
    });
    expect(s).toEqual({ ...DEFAULT_WORKSPACE_SIDEBAR, expanded: ["/a"] });
  });

  it("drops negative or non-finite scroll and keeps a valid one", () => {
    expect(
      sanitizeWorkspaceSidebar({ scroll: { root: "/p", top: -5 } })?.scroll,
    ).toBeNull();
    expect(
      sanitizeWorkspaceSidebar({ scroll: { root: "/p", top: 40 } })?.scroll,
    ).toEqual({ root: "/p", top: 40 });
  });

  it("caps the number of open folders", () => {
    const many = Array.from({ length: 2000 }, (_, i) => `/p/d${i}`);
    expect(sanitizeWorkspaceSidebar({ expanded: many })?.expanded.length).toBe(500);
  });
});

const ws = (id: string, sidebar?: Workspace["sidebar"]) =>
  ({ id, sidebar }) as unknown as Workspace;

describe("applySidebarView / applyExplorerSnapshots", () => {
  it("sets the view of one workspace and keeps the rest of its snapshot", () => {
    const a = ws("a", { ...DEFAULT_WORKSPACE_SIDEBAR, expanded: ["/p/x"] });
    const b = ws("b");
    const out = applySidebarView([a, b], "a", "git");
    expect(out[0].sidebar).toEqual({ ...DEFAULT_WORKSPACE_SIDEBAR, expanded: ["/p/x"], view: "git" });
    expect(out[1]).toBe(b);
  });

  it("merges explorer fields without touching the view", () => {
    const a = ws("a", { ...DEFAULT_WORKSPACE_SIDEBAR, view: "git" });
    const out = applyExplorerSnapshots([a], new Map([["a", snap({ expanded: ["/p/x"] })]]));
    expect(out[0].sidebar).toEqual({ view: "git", expanded: ["/p/x"], selectedPath: null, scroll: null });
  });

  it("returns the same array when the pushed snapshot equals the stored one", () => {
    const stored = {
      ...DEFAULT_WORKSPACE_SIDEBAR,
      expanded: ["/p/a", "/p/b"],
      selectedPath: "/p/a/x.ts",
      scroll: { root: "/p", top: 40 },
    };
    const list = [ws("a", stored), ws("b")];
    const same = snap({
      expanded: ["/p/a", "/p/b"],
      selectedPath: "/p/a/x.ts",
      scroll: { root: "/p", top: 40 },
    });
    expect(applyExplorerSnapshots(list, new Map([["a", same]]))).toBe(list);
  });

  it("returns a new array when any explorer field differs", () => {
    const stored = {
      ...DEFAULT_WORKSPACE_SIDEBAR,
      expanded: ["/p/a"],
      scroll: { root: "/p", top: 40 },
    };
    const list = [ws("a", stored)];
    const variants = [
      snap({ expanded: ["/p/b"], scroll: { root: "/p", top: 40 } }),
      snap({ expanded: ["/p/a", "/p/b"], scroll: { root: "/p", top: 40 } }),
      snap({ expanded: ["/p/a"], selectedPath: "/p/a/x.ts", scroll: { root: "/p", top: 40 } }),
      snap({ expanded: ["/p/a"], scroll: { root: "/p", top: 41 } }),
      snap({ expanded: ["/p/a"], scroll: { root: "/q", top: 40 } }),
      snap({ expanded: ["/p/a"], scroll: null }),
    ];
    for (const v of variants) {
      expect(applyExplorerSnapshots(list, new Map([["a", v]]))).not.toBe(list);
    }
  });

  it("stores a first snapshot for a workspace that had none", () => {
    const list = [ws("a")];
    expect(applyExplorerSnapshots(list, new Map([["a", snap()]]))).not.toBe(list);
  });

  it("returns the same array when the view does not change", () => {
    const list = [ws("a", { ...DEFAULT_WORKSPACE_SIDEBAR, view: "history" })];
    expect(applySidebarView(list, "a", "history")).toBe(list);
    expect(applySidebarView(list, "missing", "history")).toBe(list);
  });

  it("ignores snapshots for workspaces that no longer exist and keeps the array when nothing applies", () => {
    const list = [ws("a")];
    const out = applyExplorerSnapshots(list, new Map([["gone", snap()]]));
    expect(out).toBe(list);
  });
});
