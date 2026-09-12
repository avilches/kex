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
import { toast } from "sonner";
import { useDocument, type DocumentState } from "./useDocument";

type Hook = ReturnType<typeof useDocument>;

function mountUseDocument(path: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: Hook | undefined;

  function Harness() {
    latest = useDocument({ path });
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
    expect(toast).not.toHaveBeenCalled();
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "changed on disk",
      size: 16,
    } satisfies DocumentState);

    harness.unmount();
  });

  it("warns and skips the reload when the buffer is dirty, but lets the user discard local edits", async () => {
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
    expect(toast).toHaveBeenCalledTimes(1);
    expect(harness.hook.dirty).toBe(true);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "on disk",
      size: 7,
    } satisfies DocumentState);

    const [, options] = vi.mocked(toast).mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(options.action.label).toBe("Reload from disk");

    await act(async () => {
      options.action.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(invoke).toHaveBeenCalledWith(
      "fs_read_file",
      expect.objectContaining({ path: "/tmp/b.txt" }),
    );
    expect(harness.hook.dirty).toBe(false);
    expect(harness.hook.doc).toEqual({
      status: "ready",
      content: "external edit",
      size: 13,
    } satisfies DocumentState);

    harness.unmount();
  });

  it("calling reload twice while dirty reuses one toast instead of stacking", async () => {
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

    expect(toast).toHaveBeenCalledTimes(2);
    const idOf = (n: number) =>
      (vi.mocked(toast).mock.calls[n] as [string, { id: string }])[1].id;
    expect(idOf(0)).toBe(idOf(1));

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
});
