// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HibernatedInfo } from "./HibernatedInfo";
import { INFO_VARIANTS, infoVariantFor } from "./lib/infoVariant";

afterEach(cleanup);

const props = { icon: null, title: "Claude Code", folder: "~/Hub/Kex", command: "claude --resume abc" };

describe("infoVariantFor", () => {
  it("hands the variants out in order, once per tab, and keeps a tab's variant", () => {
    const first = infoVariantFor("tab-seq-1");
    const second = infoVariantFor("tab-seq-2");
    expect(INFO_VARIANTS.indexOf(second)).toBe((INFO_VARIANTS.indexOf(first) + 1) % INFO_VARIANTS.length);
    expect(infoVariantFor("tab-seq-1")).toBe(first);
  });
});

describe("HibernatedInfo", () => {
  it.each(["indent", "box", "labels"] as const)("%s shows the title, folder and command", (variant) => {
    const { getByText, container } = render(<HibernatedInfo variant={variant} {...props} />);
    expect(getByText("Claude Code")).toBeTruthy();
    expect(getByText("~/Hub/Kex")).toBeTruthy();
    expect(getByText("claude --resume abc")).toBeTruthy();
    expect(container.querySelector("[data-hibernated-variant]")?.textContent).toBe(variant);
  });

  it("labels names each line", () => {
    const { getByText } = render(<HibernatedInfo variant="labels" {...props} />);
    expect(getByText("Folder")).toBeTruthy();
    expect(getByText("Command")).toBeTruthy();
  });

  it("collapsible starts closed and Details opens and closes the folder and command", () => {
    const { getByRole, queryByText } = render(<HibernatedInfo variant="collapsible" {...props} />);
    expect(queryByText("~/Hub/Kex")).toBeNull();
    const toggle = getByRole("button", { name: /Details/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(queryByText("~/Hub/Kex")).toBeTruthy();
    expect(queryByText("claude --resume abc")).toBeTruthy();
    fireEvent.click(toggle);
    expect(queryByText("~/Hub/Kex")).toBeNull();
  });

  it("collapsible has no Details toggle when there is nothing to show", () => {
    const { queryByRole } = render(<HibernatedInfo variant="collapsible" {...props} folder={null} command={null} />);
    expect(queryByRole("button")).toBeNull();
  });
});
