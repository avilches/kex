// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => undefined,
}));
const prefs = vi.hoisted(() => ({ autoSave: false }));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (
    selector: (state: {
      editorAutoSave: boolean;
      editorAutoSaveDelay: number;
    }) => unknown,
  ) => selector({ editorAutoSave: prefs.autoSave, editorAutoSaveDelay: 500 }),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  discardUnflushedBuffers,
  hasUnflushedBuffer,
} from "./unflushedBuffers";
import {
  CONFLICT_SAVE_ERROR,
  DELETED_SAVE_ERROR,
  type DocumentState,
  useDocument,
} from "./useDocument";

type Hook = ReturnType<typeof useDocument>;

function mountUseDocument(path: string, tabId: string = path, visible = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: Hook | undefined;

  function Harness({ visible }: { visible: boolean }) {
    latest = useDocument({ path, tabId, visible });
    return null;
  }

  act(() => {
    root.render(createElement(Harness, { visible }));
  });

  return {
    get hook(): Hook {
      if (!latest) throw new Error("hook did not mount");
      return latest;
    },
    setVisible: (v: boolean) =>
      act(() => {
        root.render(createElement(Harness, { visible: v }));
      }),
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
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const harness = mountUseDocument("/tmp/a.txt");
    await flush();

    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "changed on disk",
      size: 16,
    });

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
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const harness = mountUseDocument("/tmp/b.txt");
    await flush();

    act(() => {
      harness.hook.onChange("local edit");
    });
    expect(harness.hook.dirty).toBe(true);

    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "external edit",
      size: 13,
    });

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
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
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

  it("refuses to save while a conflict is pending, and saves once the user keeps the local edit", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const harness = mountUseDocument("/tmp/c.txt");
    await flush();
    act(() => {
      harness.hook.onChange("local edit");
    });
    act(() => {
      harness.hook.reload();
    });
    expect(harness.hook.conflict).toBe(true);
    vi.mocked(invoke).mockClear();

    await expect(harness.hook.save()).rejects.toThrow(CONFLICT_SAVE_ERROR);
    expect(invoke).not.toHaveBeenCalledWith("fs_write_file", expect.anything());

    act(() => {
      harness.hook.keepLocalChanges();
    });
    await act(async () => {
      await harness.hook.save();
    });
    expect(invoke).toHaveBeenCalledWith(
      "fs_write_file",
      expect.objectContaining({ content: "local edit" }),
    );

    harness.unmount();
  });

  it("detects the file was deleted even while dirty, without touching the buffer", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
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

    expect(harness.hook.doc).toEqual({
      status: "deleted",
    } satisfies DocumentState);
    // The unsaved edit itself is never discarded by the deletion check.
    expect(harness.hook.dirty).toBe(true);

    harness.unmount();
  });

  it("refuses to save a deleted file instead of silently recreating it", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const harness = mountUseDocument("/tmp/gone.txt");
    await flush();
    act(() => {
      harness.hook.onChange("local edit");
    });
    vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));
    act(() => {
      harness.hook.reload();
    });
    await flush();
    expect(harness.hook.doc).toEqual({
      status: "deleted",
    } satisfies DocumentState);
    act(() => {
      harness.hook.keepLocalChanges();
    });
    vi.mocked(invoke).mockClear();

    await expect(harness.hook.save()).rejects.toThrow(DELETED_SAVE_ERROR);
    expect(invoke).not.toHaveBeenCalledWith("fs_write_file", expect.anything());

    harness.unmount();
  });

  it("recreates the file from the buffer and leaves no conflict when the watcher reloads it afterwards", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const harness = mountUseDocument("/tmp/recreate.txt");
    await flush();

    act(() => {
      harness.hook.onChange("local edit");
    });
    vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));
    act(() => {
      harness.hook.reload();
    });
    await flush();
    expect(harness.hook.doc).toEqual({
      status: "deleted",
    } satisfies DocumentState);
    // The deletion reload left a conflict pending while dirty; the deleted
    // state renders no overlay, so Save to recreate file stays clickable.
    expect(harness.hook.conflict).toBe(true);

    // Recreate: writes the in-memory buffer back to the path. The write
    // itself resolves any pending conflict, so the ready state must not pop
    // the keep-your-changes overlay afterwards.
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue(undefined);
    await act(async () => {
      await harness.hook.recreate();
    });
    expect(invoke).toHaveBeenCalledWith(
      "fs_write_file",
      expect.objectContaining({ content: "local edit" }),
    );
    expect(harness.hook.conflict).toBe(false);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "local edit",
      size: 10,
    } satisfies DocumentState);

    // The watcher reload that fires after our own write must not pop the
    // conflict overlay: the buffer equals what was just saved.
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "local edit",
      size: 10,
    });

    let returned: boolean | undefined;
    act(() => {
      returned = harness.hook.reload();
    });
    await flush();

    expect(returned).toBe(true);
    expect(harness.hook.conflict).toBe(false);
    expect(harness.hook.dirty).toBe(false);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "local edit",
      size: 10,
    } satisfies DocumentState);

    harness.unmount();
  });

  it("leaves the deleted state when the file reappears with the same content", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const harness = mountUseDocument("/tmp/r1.txt");
    await flush();

    vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));
    act(() => {
      harness.hook.reload();
    });
    await flush();
    expect(harness.hook.doc).toEqual({
      status: "deleted",
    } satisfies DocumentState);

    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    act(() => {
      harness.hook.reload();
    });
    await flush();

    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "on disk",
      size: 7,
    } satisfies DocumentState);

    harness.unmount();
  });

  describe("a deleted file that reappears without any fs event", () => {
    async function deleteIt(path: string, visible = true) {
      vi.mocked(invoke).mockResolvedValue({
        kind: "text",
        content: "on disk",
        size: 7,
      });
      const harness = mountUseDocument(path, path, visible);
      await flush();
      vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));
      act(() => {
        harness.hook.reload();
      });
      await flush();
      expect(harness.hook.doc).toEqual({
        status: "deleted",
      } satisfies DocumentState);
      // The vault is unlocked: the path resolves again but the stale watcher
      // never emits fs:changed for the new mount.
      vi.mocked(invoke).mockResolvedValue({
        kind: "text",
        content: "on disk",
        size: 7,
      });
      return harness;
    }

    const ready = {
      status: "ready",
      content: "on disk",
      size: 7,
    } satisfies DocumentState;

    it("recovers when the window regains focus", async () => {
      const harness = await deleteIt("/tmp/vault-focus.md");
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      await flush();
      expect(harness.hook.doc).toEqual(ready);
      harness.unmount();
    });

    it("recovers when the tab becomes visible, and not while it is hidden", async () => {
      const harness = await deleteIt("/tmp/vault-tab.md", false);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      await flush();
      expect(harness.hook.doc).toEqual({
        status: "deleted",
      } satisfies DocumentState);

      harness.setVisible(true);
      await flush();
      expect(harness.hook.doc).toEqual(ready);
      harness.unmount();
    });

    it("recovers on demand and reports when the file is still missing", async () => {
      const harness = await deleteIt("/tmp/vault-refresh.md", false);
      vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));
      let exists: boolean | undefined;
      await act(async () => {
        exists = await harness.hook.refresh();
      });
      expect(exists).toBe(false);
      expect(harness.hook.doc).toEqual({
        status: "deleted",
      } satisfies DocumentState);

      vi.mocked(invoke).mockResolvedValue({
        kind: "text",
        content: "on disk",
        size: 7,
      });
      await act(async () => {
        exists = await harness.hook.refresh();
      });
      await flush();
      expect(exists).toBe(true);
      expect(harness.hook.doc).toEqual(ready);
      harness.unmount();
    });
  });

  it("leaves the deleted state with a conflict when the file reappears while dirty", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const harness = mountUseDocument("/tmp/r2.txt");
    await flush();

    act(() => {
      harness.hook.onChange("local edit");
    });
    vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));
    act(() => {
      harness.hook.reload();
    });
    await flush();
    expect(harness.hook.doc).toEqual({
      status: "deleted",
    } satisfies DocumentState);

    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "recreated",
      size: 9,
    });
    act(() => {
      harness.hook.reload();
    });
    await flush();

    expect(harness.hook.doc).toMatchObject({
      status: "ready",
      content: "local edit",
    });
    expect(harness.hook.dirty).toBe(true);
    expect(harness.hook.conflict).toBe(true);

    harness.unmount();
  });

  describe("unmounting with autosave on", () => {
    beforeEach(() => {
      prefs.autoSave = true;
      discardUnflushedBuffers(["/tmp/f.txt", "/tmp/g.txt"]);
    });
    afterEach(() => {
      prefs.autoSave = false;
    });

    it("keeps the buffer in memory when the final write fails", async () => {
      vi.mocked(invoke).mockResolvedValue({
        kind: "text",
        content: "on disk",
        size: 7,
      });
      const harness = mountUseDocument("/tmp/f.txt");
      await flush();
      act(() => {
        harness.hook.onChange("local edit");
      });

      vi.mocked(invoke).mockRejectedValue(new Error("EACCES"));
      harness.unmount();
      await flush();

      expect(hasUnflushedBuffer("/tmp/f.txt")).toBe(true);
    });

    it("keeps the buffer in memory when the file was deleted", async () => {
      vi.mocked(invoke).mockResolvedValue({
        kind: "text",
        content: "on disk",
        size: 7,
      });
      const harness = mountUseDocument("/tmp/g.txt");
      await flush();
      act(() => {
        harness.hook.onChange("local edit");
      });
      vi.mocked(invoke).mockRejectedValue(new Error("ENOENT"));
      act(() => {
        harness.hook.reload();
      });
      await flush();
      expect(harness.hook.doc).toEqual({
        status: "deleted",
      } satisfies DocumentState);

      harness.unmount();

      expect(hasUnflushedBuffer("/tmp/g.txt")).toBe(true);
    });
  });

  it("carries an unsaved edit across unmount instead of saving it, and restores it on remount", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
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
    expect(invoke).not.toHaveBeenCalledWith("fs_write_file", expect.anything());

    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
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

  it("keeps an unresolved disk conflict across a remount of the same tab", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const first = mountUseDocument("/tmp/c.txt", "tab-c");
    await flush();
    act(() => {
      first.hook.onChange("local edit");
    });
    act(() => {
      first.hook.reload();
    });
    expect(first.hook.conflict).toBe(true);
    first.unmount();

    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "changed outside",
      size: 15,
    });
    const second = mountUseDocument("/tmp/c.txt", "tab-c");
    await flush();
    expect(second.hook.dirty).toBe(true);
    expect(second.hook.conflict).toBe(true);
    await expect(second.hook.save()).rejects.toThrow(CONFLICT_SAVE_ERROR);
    second.unmount();
  });

  it("keeps two tabs on the same path from stomping each other's unflushed buffer", async () => {
    // The same file can be open in two tabs (different panes or workspaces)
    // at once; the unflushed-buffer cache must be keyed by tab identity, not
    // just path, or one unmounting overwrites (or adopts) the other's stash.
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
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

    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
    const reopenedA = mountUseDocument("/tmp/shared.txt", "tab-a");
    await flush();
    expect(reopenedA.hook.doc).toMatchObject({ content: "edit from A" });
    reopenedA.unmount();

    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
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
    vi.mocked(invoke).mockResolvedValue({
      kind: "text",
      content: "on disk",
      size: 7,
    });
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
