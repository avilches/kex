// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PopoverAnchor } from "@/components/ui/popover";
import { TabRenamePopover } from "./TabRenamePopover";
import { useTabRenameStore } from "./lib/tabRenameStore";
import type { RenameOrigin } from "./lib/tabRenameStore";

function field(tabId: string, origin: RenameOrigin, onRenameTab = vi.fn()) {
  return (
    <TabRenamePopover tabId={tabId} origin={origin} title="old" placeholder="ph" onRenameTab={onRenameTab}>
      <PopoverAnchor asChild>
        <div>anchor</div>
      </PopoverAnchor>
    </TabRenamePopover>
  );
}

describe("TabRenamePopover", () => {
  beforeEach(() => {
    useTabRenameStore.setState({ renamingTabId: null, renamingOrigin: "pane", saveSeq: 0 });
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

  it("saves on a save request only while its field is open", () => {
    const onRenameTab = vi.fn();
    render(field("tab-1", "sidebar", onRenameTab));
    act(() => useTabRenameStore.getState().requestSave());
    expect(onRenameTab).not.toHaveBeenCalled();
    act(() => useTabRenameStore.getState().startRename("tab-1", "sidebar"));
    act(() => useTabRenameStore.getState().requestSave());
    expect(onRenameTab).toHaveBeenCalledTimes(1);
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });
});
