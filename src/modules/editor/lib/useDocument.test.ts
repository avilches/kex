// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/modules/workspace", () => ({ currentWorkspaceEnv: () => undefined }));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (
    selector: (state: { editorAutoSave: boolean; editorAutoSaveDelay: number }) => unknown,
  ) => selector({ editorAutoSave: false, editorAutoSaveDelay: 500 }),
}));

import { invoke } from "@tauri-apps/api/core";
import { useDocument, type DocumentState } from "./useDocument";

type Hook = ReturnType<typeof useDocument>;

function mountUseDocument(path: string, tabId: string = path) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: Hook | undefined;

  function Harness() {
    latest = useDocument({ path, tabId });
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    get hook(): Hook {
      if (!latest) throw new Error("hook did not mount");
      return latest;
    },
    unmount: () => act(() => root.unmount()),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useDocument reload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reloads silently from disk when the buffer is clean", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const harness = mountUseDocument("/tmp/a.txt");
    await flush();

    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "changed on disk", size: 16 });

    let returned: boolean | undefined;
    act(() => {
      returned = harness.hook.reload();
    });
    await flush();

    expect(returned).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      "fs_read_file",
      expect.objectContaining({ path: "/tmp/a.txt" }),
    );
    expect(harness.hook.conflict).toBe(false);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "changed on disk",
      size: 16,
    } satisfies DocumentState);

    harness.unmount();
  });

  it("blocks the pane on a conflict when the buffer is dirty, but lets the user discard local edits", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const harness = mountUseDocument("/tmp/b.txt");
    await flush();

    act(() => {
      harness.hook.onChange("local edit");
    });
    expect(harness.hook.dirty).toBe(true);

    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "external edit", size: 13 });

    let returned: boolean | undefined;
    act(() => {
      returned = harness.hook.reload();
    });

    expect(returned).toBe(false);
    // Still probes the disk (so a concurrent deletion is caught even while
    // dirty), but the content below shows this didn't apply the result.
    expect(invoke).toHaveBeenCalledWith(
      "fs_read_file",
      expect.objectContaining({ path: "/tmp/b.txt" }),
    );
    expect(harness.hook.conflict).toBe(true);
    expect(harness.hook.dirty).toBe(true);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "on disk",
      size: 7,
    } satisfies DocumentState);

    await act(async () => {
      harness.hook.reloadFromDisk();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(invoke).toHaveBeenCalledWith(
      "fs_read_file",
      expect.objectContaining({ path: "/tmp/b.txt" }),
    );
    expect(harness.hook.conflict).toBe(false);
    expect(harness.hook.dirty).toBe(false);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "external edit",
      size: 13,
    } satisfies DocumentState);

    harness.unmount();
  });

  it("keepLocalChanges dismisses the conflict without touching the buffer", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const harness = mountUseDocument("/tmp/c.txt");
    await flush();

    act(() => {
      harness.hook.onChange("local edit");
    });

    act(() => {
      harness.hook.reload();
      harness.hook.reload();
    });

    expect(harness.hook.conflict).toBe(true);

    act(() => {
      harness.hook.keepLocalChanges();
    });

    expect(harness.hook.conflict).toBe(false);
    expect(harness.hook.dirty).toBe(true);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "on disk",
      size: 7,
    } satisfies DocumentState);

    harness.unmount();
  });

  it("detects the file was deleted even while dirty, without touching the buffer", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const harness = mountUseDocument("/tmp/d.txt");
    await flush();

    act(() => {
      harness.hook.onChange("local edit");
    });
    expect(harness.hook.dirty).toBe(true);

    // Both fs_read_file (the reload probe) and fs_stat (the existence check
    // in its catch handler) reject: the file is gone.
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));

    act(() => {
      harness.hook.reload();
    });
    await flush();

    expect(harness.hook.doc).toEqual({ status: "deleted" } satisfies DocumentState);
    // The unsaved edit itself is never discarded by the deletion check.
    expect(harness.hook.dirty).toBe(true);

    harness.unmount();
  });

  it("carries an unsaved edit across unmount instead of saving it, and restores it on remount", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const first = mountUseDocument("/tmp/e.txt");
    await flush();

    act(() => {
      first.hook.onChange("local edit");
    });
    expect(first.hook.dirty).toBe(true);

    vi.mocked(invoke).mockClear();
    first.unmount();

    // Unmounting a dirty buffer (e.g. dragging the tab to another pane)
    // must not write to disk on its own.
    expect(invoke).not.toHaveBeenCalledWith(
      "fs_write_file",
      expect.anything(),
    );

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const second = mountUseDocument("/tmp/e.txt");
    await flush();

    expect(second.hook.dirty).toBe(true);
    expect(second.hook.doc).toEqual({
      status: "ready",
      content: "local edit",
      size: 7,
    } satisfies DocumentState);

    second.unmount();
  });

  it("keeps two tabs on the same path from stomping each other's unflushed buffer", async () => {
    // The same file can be open in two tabs (different panes or workspaces)
    // at once; the unflushed-buffer cache must be keyed by tab identity, not
    // just path, or one unmounting overwrites (or adopts) the other's stash.
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const tabA = mountUseDocument("/tmp/shared.txt", "tab-a");
    const tabB = mountUseDocument("/tmp/shared.txt", "tab-b");
    await flush();

    act(() => {
      tabA.hook.onChange("edit from A");
    });
    act(() => {
      tabB.hook.onChange("edit from B");
    });

    tabA.unmount();
    tabB.unmount();

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const reopenedA = mountUseDocument("/tmp/shared.txt", "tab-a");
    await flush();
    expect(reopenedA.hook.doc).toMatchObject({ content: "edit from A" });
    reopenedA.unmount();

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const reopenedB = mountUseDocument("/tmp/shared.txt", "tab-b");
    await flush();
    expect(reopenedB.hook.doc).toMatchObject({ content: "edit from B" });
    reopenedB.unmount();
  });

  it("reloadFromDisk applies even when disk currently matches what was last read", async () => {
    // The file was edited externally and then reverted (or was never really
    // different from savedRef at the moment the user forces the reload):
    // the dirty in-memory buffer must still be discarded, not kept just
    // because it looks like a duplicate watcher event.
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "on disk", size: 7 });
    const harness = mountUseDocument("/tmp/h.txt");
    await flush();

    act(() => {
      harness.hook.onChange("local edit");
    });
    act(() => {
      harness.hook.reload();
    });
    expect(harness.hook.conflict).toBe(true);

    await act(async () => {
      harness.hook.reloadFromDisk();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.hook.conflict).toBe(false);
    expect(harness.hook.dirty).toBe(false);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "on disk",
      size: 7,
    } satisfies DocumentState);

    harness.unmount();
  });
});
