// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command, CommandList } from "@/components/ui/command";
import type { TabEntry } from "./lib/tabEntries";
import { TabItem } from "./TabItem";

vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));

afterEach(cleanup);

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: "t1",
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null,
  workspaceRoot: null,
  hibernated: false,
  kind: "terminal",
  title: "api",
  note: null,
  cwd: "/p",
  detail: "",
  worktree: "",
  branch: "",
  process: "",
  command: "",
  agent: "",
  indicator: null,
  tab: { id: "t1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  order: 0,
  ...over,
});

function mount(e: TabEntry) {
  return render(
    <Command>
      <CommandList>
        <TabItem entry={e} term="" onRun={() => {}} onContextMenu={() => {}} />
      </CommandList>
    </Command>,
  );
}

describe("TabItem marks", () => {
  it("lays the dot over the dimmed sleeping icon in one spot, and never dims the dot", () => {
    const { getByLabelText, container } = mount(entry({ hibernated: true, indicator: "attention" }));
    const icon = getByLabelText("Tab is hibernated");
    const dot = getByLabelText("Agent needs attention");
    expect(icon.parentElement).toBe(dot.parentElement!.parentElement);
    expect(icon.className).toContain("opacity-40");
    expect(dot.closest(".opacity-40")).toBeNull();
    expect(container.querySelector(".opacity-40")).not.toBeNull();
  });

  it("puts the blue unsaved dot right behind the name of a dirty file, not at the far right", () => {
    const { getByLabelText, queryByLabelText, container } = mount(
      entry({
        kind: "editor",
        title: "main.ts",
        tab: { id: "t1", kind: "editor", path: "/p/main.ts", dirty: true, preview: false },
      }),
    );
    const dot = getByLabelText("Unsaved changes");
    expect(dot.previousElementSibling?.textContent).toBe("main.ts");
    expect(dot.className).toContain("text-primary");
    cleanup();
    mount(entry({ kind: "editor", title: "main.ts", tab: { id: "t1", kind: "editor", path: "/p/main.ts", dirty: false, preview: false } }));
    expect(queryByLabelText("Unsaved changes")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("shows the spinner on a terminal running a command, but not on an idle agent or a plain shell", () => {
    const spinner = (e: TabEntry) => mount(e).container.querySelector("[data-slot=spinner], .animate-spin");
    expect(spinner(entry({ running: true }))).not.toBeNull();
    cleanup();
    expect(spinner(entry({ running: true, agent: "claude" }))).toBeNull();
    cleanup();
    expect(spinner(entry())).toBeNull();
  });

  it("shows the dot alone on a tab that is awake", () => {
    const { queryByLabelText, getByLabelText } = mount(entry({ indicator: "error" }));
    expect(queryByLabelText("Tab is hibernated")).toBeNull();
    expect(getByLabelText("Agent needs attention").className).toContain("bg-destructive");
  });
});
