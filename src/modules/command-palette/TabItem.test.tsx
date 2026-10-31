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
  it("lays the dot over the sleeping icon in one spot, and dims only the sleeping content", () => {
    const { getByLabelText, container } = mount(entry({ hibernated: true, indicator: "attention" }));
    const icon = getByLabelText("Tab is hibernated");
    const dot = getByLabelText("Agent needs attention");
    expect(icon.parentElement).toBe(dot.parentElement!.parentElement);
    expect(icon.className).not.toContain("opacity");
    expect(dot.closest(".opacity-40")).toBeNull();
    expect(icon.closest(".opacity-40")).toBeNull();
    expect(container.querySelector(".opacity-40")).not.toBeNull();
  });

  it("shows the dot alone on a tab that is awake", () => {
    const { queryByLabelText, getByLabelText } = mount(entry({ indicator: "error" }));
    expect(queryByLabelText("Tab is hibernated")).toBeNull();
    expect(getByLabelText("Agent needs attention").className).toContain("bg-destructive");
  });
});
