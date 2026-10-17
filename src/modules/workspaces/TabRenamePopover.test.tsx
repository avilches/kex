// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PopoverAnchor } from "@/components/ui/popover";
import { TabRenamePopover } from "./TabRenamePopover";
import { useTabRenameStore } from "./lib/tabRenameStore";
import type { RenameOrigin } from "./lib/tabRenameStore";
import { getTitleDraft } from "./lib/titleDraftStore";
import type { Tab } from "./lib/types";

const TABS: Record<Tab["kind"], Tab> = {
  terminal: { id: "tab-1", kind: "terminal", cwd: "/code/kex" },
  browser: { id: "tab-1", kind: "browser", url: "https://example.com" },
  editor: { id: "tab-1", kind: "editor", path: "/code/kex/src/index.ts", dirty: false, preview: false },
  markdown: { id: "tab-1", kind: "markdown", path: "/code/kex/notes.md" },
  "git-diff": { id: "tab-1", kind: "git-diff", path: "/code/kex/index.ts", repoRoot: "/code/kex", mode: "-", originalPath: null, preview: false },
  "git-history": { id: "tab-1", kind: "git-history", repoRoot: "/code/kex" },
  "git-commit-file": { id: "tab-1", kind: "git-commit-file", repoRoot: "/code/kex", sha: "abc", path: "/code/kex/index.ts", originalPath: null, preview: false },
};

function field(tabId: string, origin: RenameOrigin, onRenameTab = vi.fn(), kind: Tab["kind"] = "terminal") {
  return (
    <TabRenamePopover tabId={tabId} tab={{ ...TABS[kind], id: tabId }} origin={origin} title="old" placeholder="ph" onRenameTab={onRenameTab}>
      <PopoverAnchor asChild>
        <div>anchor</div>
      </PopoverAnchor>
    </TabRenamePopover>
  );
}

describe("TabRenamePopover", () => {
  beforeEach(() => {
    useTabRenameStore.setState({ renamingTabId: null, renamingOrigin: "pane", templatesOpen: false });
  });
  afterEach(cleanup);

  it("clears the rename when it unmounts with its field open", () => {
    const view = render(field("tab-1", "sidebar"));
    act(() => useTabRenameStore.getState().startRename("tab-1", "sidebar"));
    expect(screen.getByPlaceholderText("ph")).toBeTruthy();
    view.unmount();
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });

  it("leaves a rename that belongs to another origin or tab alone when it unmounts", () => {
    const view = render(field("tab-1", "sidebar"));
    act(() => useTabRenameStore.getState().startRename("tab-1", "pane"));
    view.unmount();
    expect(useTabRenameStore.getState().renamingTabId).toBe("tab-1");

    const other = render(field("tab-2", "sidebar"));
    act(() => useTabRenameStore.getState().startRename("tab-3", "sidebar"));
    other.unmount();
    expect(useTabRenameStore.getState().renamingTabId).toBe("tab-3");
  });

  it("keeps the templates list collapsed until it is asked for", () => {
    render(field("tab-1", "pane"));
    act(() => useTabRenameStore.getState().startRename("tab-1", "pane"));
    expect(screen.queryByTitle("Only the name of that folder")).toBeNull();
    act(() => useTabRenameStore.getState().toggleTemplates());
    expect(screen.getByTitle("Only the name of that folder")).toBeTruthy();
    act(() => useTabRenameStore.getState().toggleTemplates());
    expect(screen.queryByTitle("Only the name of that folder")).toBeNull();
  });

  it("offers only the variables the tab kind has and inserts them at the caret", () => {
    render(field("tab-1", "pane"));
    act(() => useTabRenameStore.getState().startRename("tab-1", "pane"));
    act(() => useTabRenameStore.getState().toggleTemplates());
    expect(screen.queryByTitle("Address of the page")).toBeNull();
    const input = screen.getByPlaceholderText("ph") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a·" } });
    fireEvent.click(screen.getByTitle("Only the name of that folder"));
    expect(input.value).toBe("a·{dir}");
    expect(getTitleDraft("tab-1")).toBe("a·{dir}");
    expect(useTabRenameStore.getState().renamingTabId).toBe("tab-1");
  });

  it("previews what is typed and drops the preview when the field closes", () => {
    render(field("tab-1", "pane"));
    act(() => useTabRenameStore.getState().startRename("tab-1", "pane"));
    fireEvent.change(screen.getByPlaceholderText("ph"), { target: { value: "{dir}" } });
    expect(getTitleDraft("tab-1")).toBe("{dir}");
    act(() => useTabRenameStore.getState().clearRename());
    expect(getTitleDraft("tab-1")).toBeUndefined();
  });
});
