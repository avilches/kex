import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDITOR_CATALOG } from "@/modules/external-editors/catalog";
import { GLYPHS } from "./actionIcons";
import { AGENT_LOGO_IDS, filterIcons, formatIcon, GLYPH_NAMES, ICON_APP_IDS, iconOptions, parseIcon } from "./actionIconRefs";
import { normalizeActions, updateAction } from "./actions";
import type { Action } from "./types";

describe("parseIcon", () => {
  it("reads the three stored forms", () => {
    expect(parseIcon("glyph:rocket")).toEqual({ source: "glyph", name: "rocket" });
    expect(parseIcon("app:zed")).toEqual({ source: "app", id: "zed" });
    expect(parseIcon("agent:claude")).toEqual({ source: "agent", id: "claude" });
  });

  it("refuses anything that does not resolve to an icon Kex draws", () => {
    for (const bad of ["", undefined, null, "rocket", "glyph:nope", "app:nope", "agent:nope", "emoji:x", "glyph:", ":rocket"]) {
      expect(parseIcon(bad as string | undefined)).toBeNull();
    }
  });

  it("round-trips every option through its stored value", () => {
    for (const kind of ["script", "app", "agent"] as const) {
      for (const o of iconOptions(kind)) expect(parseIcon(o.value)).toEqual(o.ref);
    }
    expect(formatIcon({ source: "glyph", name: "star" })).toBe("glyph:star");
  });
});

describe("iconOptions", () => {
  it("offers every glyph, every app with an icon file and every agent logo exactly once, whatever the kind", () => {
    for (const kind of ["script", "app", "agent"] as const) {
      const values = iconOptions(kind).map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
      expect(values).toHaveLength(GLYPH_NAMES.length + ICON_APP_IDS.length + AGENT_LOGO_IDS.length);
    }
  });

  it("draws every glyph name it offers, and offers every glyph it can draw", () => {
    expect([...GLYPH_NAMES].sort()).toEqual(Object.keys(GLYPHS).sort());
  });

  it("leaves out the catalog entries that ship no icon file", () => {
    const shipped = new Set(readdirSync("public/assets/editors").map((f) => f.replace(/\.(svg|png)$/, "")));
    for (const id of ICON_APP_IDS) expect(shipped.has(id)).toBe(true);
    const skipped = EDITOR_CATALOG.map((e) => e.id).filter((id) => !ICON_APP_IDS.includes(id));
    expect(skipped.sort()).toEqual(["android-studio-canary", "trae-solo"]);
    expect(parseIcon("app:trae-solo")).toBeNull();
  });

  it("leads with what fits the kind", () => {
    expect(iconOptions("agent")[0]?.ref.source).toBe("agent");
    expect(iconOptions("app")[0]?.ref.source).toBe("app");
    expect(iconOptions("script")[0]?.ref.source).toBe("glyph");
  });
});

describe("filterIcons", () => {
  const options = iconOptions("script");

  it("keeps everything for an empty query and matches case-insensitively on the label", () => {
    expect(filterIcons(options, "  ")).toHaveLength(options.length);
    expect(filterIcons(options, "PYCHARM").map((o) => o.value)).toEqual(["app:pycharm"]);
  });

  it("matches the words of a glyph name and the group of an app", () => {
    expect(filterIcons(options, "magic wand").map((o) => o.value)).toEqual(["glyph:magic-wand"]);
    expect(filterIcons(options, "jetbrains").length).toBeGreaterThan(5);
    expect(filterIcons(options, "zzzz")).toEqual([]);
  });
});

describe("the icon field of an Action", () => {
  const script: Action = { id: "s1", name: "dev", kind: "script", command: "pnpm dev", ownButton: false };

  it("survives normalization when valid and is dropped when it points at nothing", () => {
    const [kept] = normalizeActions([{ ...script, icon: "glyph:rocket" }]);
    expect(kept?.icon).toBe("glyph:rocket");
    const [dropped] = normalizeActions([{ ...script, icon: "glyph:gone" }]);
    expect(dropped).toBeDefined();
    expect(dropped?.icon).toBeUndefined();
  });

  it("is set and cleared through updateAction, an empty string clearing it", () => {
    const set = updateAction([script], "s1", { icon: "app:zed" });
    expect(set[0]?.icon).toBe("app:zed");
    const cleared = updateAction(set, "s1", { icon: "" });
    expect(cleared[0]?.icon).toBeUndefined();
  });
});
