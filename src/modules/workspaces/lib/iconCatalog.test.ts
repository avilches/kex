import { describe, expect, it } from "vitest";
import { buildCatalog, iconLabel, searchCatalog } from "./iconCatalog";

const mod = {
  HeartIcon: [["path", {}]],
  Home01Icon: [["path", {}]],
  HomeWifiIcon: [["path", {}]],
  AArrowDownIcon: [["path", {}]],
  default: {},
  NotAnIcon: "text",
  SomethingElse: [["path", {}]],
};

describe("iconLabel", () => {
  it("splits camel case and digits", () => {
    expect(iconLabel("Home01Icon")).toBe("Home 01");
    expect(iconLabel("AArrowDownIcon")).toBe("A Arrow Down");
  });
});

describe("buildCatalog", () => {
  it("keeps only exports named *Icon that hold icon data", () => {
    expect(buildCatalog(mod).map((e) => e.name)).toEqual([
      "HeartIcon",
      "Home01Icon",
      "HomeWifiIcon",
      "AArrowDownIcon",
    ]);
  });
});

describe("searchCatalog", () => {
  const catalog = buildCatalog(mod);

  it("returns nothing for an empty query", () => {
    expect(searchCatalog(catalog, "  ", 10)).toEqual([]);
  });

  it("requires every word and ranks prefixes first", () => {
    expect(searchCatalog(catalog, "home", 10).map((e) => e.name)).toEqual(["Home01Icon", "HomeWifiIcon"]);
    expect(searchCatalog(catalog, "arrow down", 10).map((e) => e.name)).toEqual(["AArrowDownIcon"]);
    expect(searchCatalog(catalog, "wifi home", 10).map((e) => e.name)).toEqual(["HomeWifiIcon"]);
  });

  it("honors the limit", () => {
    expect(searchCatalog(catalog, "home", 1)).toHaveLength(1);
  });
});
