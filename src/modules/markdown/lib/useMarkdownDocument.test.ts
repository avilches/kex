// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: () => Promise.resolve(() => {}),
  }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/modules/workspace", () => ({ currentWorkspaceEnv: () => undefined }));
vi.mock("@/modules/explorer/lib/watch", () => ({
  listenFsChanged: () => Promise.resolve(() => {}),
  parentDir: (p: string) => p,
  watchAdd: () => {},
  watchRemove: () => {},
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (
    selector: (state: { editorAutoSave: boolean; editorAutoSaveDelay: number }) => unknown,
  ) => selector({ editorAutoSave: false, editorAutoSaveDelay: 500 }),
}));

import { invoke } from "@tauri-apps/api/core";
import { useMarkdownDocument } from "./useMarkdownDocument";

type Hook = ReturnType<typeof useMarkdownDocument>;

function mountUseMarkdownDocument(path: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: Hook | undefined;

  function Harness() {
    latest = useMarkdownDocument({ path });
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

describe("useMarkdownDocument unmount/remount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carries an unsaved edit across unmount instead of saving it, and restores it on remount", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# on disk", size: 9 });
    const first = mountUseMarkdownDocument("/tmp/e.md");
    await flush();

    act(() => {
      first.hook.onChange("# local edit");
    });
    expect(first.hook.dirty).toBe(true);

    vi.mocked(invoke).mockClear();
    first.unmount();

    // Unmounting a dirty buffer (e.g. dragging the tab to another pane)
    // must not write to disk on its own.
    expect(invoke).not.toHaveBeenCalledWith("fs_write_file", expect.anything());

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# on disk", size: 9 });
    const second = mountUseMarkdownDocument("/tmp/e.md");
    await flush();

    expect(second.hook.dirty).toBe(true);
    expect(second.hook.doc).toMatchObject({ status: "ready", body: "# local edit" });

    second.unmount();
  });

  it("stays dirty after the freshly booted editor registers its baseline post-restore", async () => {
    // The Tab component calls setBaseline(serialize()) once its new editor
    // instance is ready. For a restored (non-pristine) body that must not
    // clear dirty, even though a normal fresh load's setBaseline call does.
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# on disk", size: 9 });
    const first = mountUseMarkdownDocument("/tmp/f.md");
    await flush();

    act(() => {
      first.hook.onChange("# local edit");
    });
    first.unmount();

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# on disk", size: 9 });
    const second = mountUseMarkdownDocument("/tmp/f.md");
    await flush();
    expect(second.hook.dirty).toBe(true);

    // A freshly booted rich editor re-serializing the restored body is
    // idempotent, so it reports back the same text as the baseline.
    act(() => {
      second.hook.setBaseline("# local edit");
    });

    expect(second.hook.dirty).toBe(true);

    second.unmount();
  });

  it("reloadFromDisk actually replaces the dirty body with what's on disk", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# on disk", size: 9 });
    const harness = mountUseMarkdownDocument("/tmp/g.md");
    await flush();

    act(() => {
      harness.hook.onChange("# local edit");
    });
    expect(harness.hook.dirty).toBe(true);

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# external edit", size: 16 });
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
    expect(harness.hook.doc).toMatchObject({ body: "# external edit" });

    harness.unmount();
  });

  it("reloadFromDisk applies even when disk currently matches what was last read", async () => {
    // The external change was reverted (or coincided with the original
    // content) by the time the user clicks "Reload from disk": the dirty
    // in-memory body must still be discarded, not kept just because
    // replaceFromDisk's duplicate-event dedup would otherwise say no-op.
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# on disk", size: 9 });
    const harness = mountUseMarkdownDocument("/tmp/h.md");
    await flush();

    act(() => {
      harness.hook.onChange("# local edit");
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
    expect(harness.hook.doc).toMatchObject({ body: "# on disk" });

    harness.unmount();
  });
});
