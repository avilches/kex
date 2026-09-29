// @vitest-environment happy-dom

import { EditorView } from "@codemirror/view";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  fsChangedHandlers: [] as ((paths: string[]) => void)[],
  windowListeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: async (name: string, cb: (event: { payload: unknown }) => void) => {
      hoisted.windowListeners.set(name, cb);
      return () => hoisted.windowListeners.delete(name);
    },
  }),
}));
vi.mock("@/modules/explorer/lib/watch", () => ({
  watchAdd: vi.fn(),
  watchRemove: vi.fn(),
  parentDir: (p: string) => p.slice(0, p.lastIndexOf("/")),
  listenFsChanged: async (handler: (paths: string[]) => void) => {
    hoisted.fsChangedHandlers.push(handler);
    return () => {
      hoisted.fsChangedHandlers = hoisted.fsChangedHandlers.filter((h) => h !== handler);
    };
  },
}));
// The real barrel pulls in EditorPathBar and its whole settings/git stack,
// which this wire-up test does not exercise.
vi.mock("@/modules/editor", async () => {
  const { ReloadConflictOverlay } = await import("@/modules/editor/ReloadConflictOverlay");
  const { useBackgroundConflictToast } = await import(
    "@/modules/editor/lib/useBackgroundConflictToast"
  );
  return {
    EditorPathBar: ({ trailing }: { trailing?: React.ReactNode }) => <>{trailing}</>,
    ReloadConflictOverlay,
    useBackgroundConflictToast,
  };
});
vi.mock("@/modules/markdown/MarkdownPreviewPane", () => ({
  MarkdownPreviewPane: ({ content }: { content: string }) => (
    <div data-testid="preview-pane">{content}</div>
  ),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn() }) }));
vi.mock("@/modules/workspace", () => ({ currentWorkspaceEnv: () => undefined }));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (
    selector: (state: { editorAutoSave: boolean; editorAutoSaveDelay: number }) => unknown,
  ) => selector({ editorAutoSave: false, editorAutoSaveDelay: 500 }),
}));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));

import { invoke } from "@tauri-apps/api/core";
import { IS_MAC } from "@/lib/platform";
import { MarkdownTab } from "@/modules/markdown/codemirror/MarkdownTab";

const PATH = "/notes/a.md";

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe("Live Preview MarkdownTab", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.fsChangedHandlers = [];
    hoisted.windowListeners.clear();
  });

  it("shows the conflict overlay when the file changes on disk while the tab is dirty", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# Hello\n", size: 8 });
    const { container } = render(
      <MarkdownTab tabId="tab-1" path={PATH} visible focused={false} callbacks={{}} />,
    );
    await flush();

    const view = EditorView.findFromDOM(container.querySelector(".cm-content") as HTMLElement);
    expect(view).not.toBeNull();
    act(() => {
      view?.dispatch({ changes: { from: view.state.doc.length, insert: "local edit\n" } });
    });
    expect(screen.queryByText(/changed on disk/)).toBeNull();

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# Changed\n", size: 10 });
    expect(hoisted.fsChangedHandlers.length).toBe(1);
    act(() => {
      for (const h of hoisted.fsChangedHandlers) h(["/notes/other.md", PATH]);
    });
    await flush();

    expect(screen.getByText(/changed on disk/)).not.toBeNull();
    expect(view?.state.doc.toString()).toBe("# Hello\nlocal edit\n");
  });

  it("saves to disk on the save shortcut, since the global handler ignores markdown tabs", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# Hello\n", size: 8 });
    const { container } = render(
      <MarkdownTab tabId="tab-save" path={PATH} visible focused={false} callbacks={{}} />,
    );
    await flush();

    const content = container.querySelector(".cm-content") as HTMLElement;
    const view = EditorView.findFromDOM(content);
    act(() => {
      view?.dispatch({ changes: { from: view.state.doc.length, insert: "edited\n" } });
    });
    act(() => {
      content.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true }),
      );
    });
    await flush();

    expect(invoke).toHaveBeenCalledWith(
      "fs_write_file",
      expect.objectContaining({ path: PATH, content: "# Hello\nedited\n" }),
    );
  });

  it("reloads silently on an external change while the tab is clean", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# Hello\n", size: 8 });
    const { container } = render(
      <MarkdownTab tabId="tab-2" path={PATH} visible focused={false} callbacks={{}} />,
    );
    await flush();

    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# Changed\n", size: 10 });
    act(() => {
      hoisted.windowListeners.get("fs:file-written")?.({ payload: { path: PATH } });
    });
    await flush();

    const view = EditorView.findFromDOM(container.querySelector(".cm-content") as HTMLElement);
    expect(screen.queryByText(/changed on disk/)).toBeNull();
    expect(view?.state.doc.toString()).toBe("# Changed\n");
  });

  it("shows the deleted-file message with a working close action when the file disappears", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "text", content: "# Hello\n", size: 8 });
    const onEditorClose = vi.fn();
    render(
      <MarkdownTab
        tabId="tab-3"
        path={PATH}
        visible
        focused={false}
        callbacks={{ onEditorClose }}
      />,
    );
    await flush();

    vi.mocked(invoke).mockRejectedValue(new Error("not found"));
    act(() => {
      for (const h of hoisted.fsChangedHandlers) h([PATH]);
    });
    await flush();

    expect(screen.getByText("This file was deleted from disk")).not.toBeNull();
    act(() => {
      screen.getByText("Close tab").click();
    });
    expect(onEditorClose).toHaveBeenCalledWith("tab-3");
  });

  describe("view modes and outline", () => {
    let tabSeq = 0;
    const setup = async (content = "# One\n\nbody\n\n## Two\n") => {
      vi.mocked(invoke).mockResolvedValue({ kind: "text", content, size: content.length });
      const utils = render(
        <MarkdownTab tabId={`tab-modes-${++tabSeq}`} path={PATH} visible focused={false} callbacks={{}} />,
      );
      await flush();
      const viewOf = () =>
        EditorView.findFromDOM(utils.container.querySelector(".cm-content") as HTMLElement);
      return { ...utils, viewOf };
    };
    const click = (name: string) =>
      act(() => {
        screen.getByRole("button", { name }).click();
      });

    it("starts in Rich, with the Live Preview decorations on", async () => {
      const { container } = await setup();
      expect(container.querySelector(".cm-lp-h1")).not.toBeNull();
      expect(screen.getByRole("button", { name: "Rich" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("Source shows the raw markdown without decorations, on the same view", async () => {
      const { container, viewOf } = await setup();
      const view = viewOf();
      act(() => view?.dispatch({ selection: { anchor: 3 } }));
      click("Source");
      expect(container.querySelector(".cm-lp-h1")).toBeNull();
      expect(viewOf()).toBe(view);
      expect(view?.state.selection.main.anchor).toBe(3);
      click("Rich");
      expect(container.querySelector(".cm-lp-h1")).not.toBeNull();
      expect(viewOf()).toBe(view);
      expect(view?.state.selection.main.anchor).toBe(3);
    });

    it("Source and Rich keep the undo history across the switch", async () => {
      const { viewOf } = await setup("abc");
      const view = viewOf();
      act(() => view?.dispatch({ changes: { from: 3, insert: "d" }, userEvent: "input.type" }));
      click("Source");
      click("Rich");
      expect(viewOf()?.state.doc.toString()).toBe("abcd");
      const { undo } = await import("@codemirror/commands");
      act(() => {
        if (view) undo(view);
      });
      expect(view?.state.doc.toString()).toBe("abc");
    });

    it("Preview unmounts the editor, renders the unsaved text read-only, and Rich brings it back", async () => {
      const { container, viewOf } = await setup("Hello");
      act(() => viewOf()?.dispatch({ changes: { from: 5, insert: " world" } }));
      click("Preview");
      expect(container.querySelector(".cm-content")).toBeNull();
      expect(screen.getByTestId("preview-pane").textContent).toBe("Hello world");
      click("Rich");
      expect(viewOf()?.state.doc.toString()).toBe("Hello world");
    });

    it("Outline lists the headings and clicking one moves the cursor to its line", async () => {
      const { viewOf } = await setup();
      expect(screen.queryByRole("button", { name: "Two" })).toBeNull();
      act(() => {
        screen.getByTitle("Toggle outline").click();
      });
      expect(screen.getByRole("button", { name: "One" })).not.toBeNull();
      act(() => {
        screen.getByRole("button", { name: "Two" }).click();
      });
      const view = viewOf();
      expect(view?.state.doc.lineAt(view.state.selection.main.head).number).toBe(5);
    });

    it("hides the Outline button in Preview", async () => {
      await setup();
      click("Preview");
      expect(screen.queryByTitle("Toggle outline")).toBeNull();
    });
  });
});
