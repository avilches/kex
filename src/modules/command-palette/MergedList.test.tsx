// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command, CommandList } from "@/components/ui/command";
import type { MergedRow } from "./lib/mergeRows";
import type { TabEntry } from "./lib/tabEntries";
import { MergedList } from "./MergedList";
import type { PaletteItem } from "./types";

vi.mock("@/modules/shortcuts", () => ({ getShortcutLabel: () => null }));

afterEach(cleanup);

const item = (id: string, title: string, group: string): PaletteItem => ({ id, title, group, run: () => {} });
const tab: TabEntry = {
  tabId: "t1",
  workspaceId: "w",
  workspaceTitle: "Work",
  hibernated: false,
  kind: "terminal",
  title: "my tab",
  note: null,
  cwd: "",
  detail: "",
  worktree: "",
  branch: "",
  process: "",
  indicator: null,
  tab: { id: "t1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  workspaceActiveAt: 0,
  order: 0,
};

function mount(rows: MergedRow[], typing: boolean) {
  return render(
    <Command shouldFilter={false}>
      <CommandList>
        <MergedList
          rows={rows}
          typing={typing}
          ambiguous={new Set()}
          userShortcuts={{} as never}
          onRunCommand={vi.fn()}
          onRunTab={vi.fn()}
          onRunWorkspace={vi.fn()}
        />
      </CommandList>
    </Command>,
  );
}

const titles = () => screen.getAllByRole("option").map((o) => o.textContent ?? "");

describe("MergedList", () => {
  const rows: MergedRow[] = [
    { kind: "command", key: "cmd:s", item: item("s", "Appearance settings", "Settings") },
    { kind: "tab", key: "tab:t1", entry: tab },
    { kind: "command", key: "cmd:g", item: item("g", "Open settings", "General") },
  ];

  it("while typing, renders rows in the ranked order whatever their kind or group", () => {
    mount(rows, true);
    const t = titles();
    expect(t[0]).toContain("Appearance settings");
    expect(t[1]).toContain("my tab");
    expect(t[2]).toContain("Open settings");
  });

  it("while typing, shows no group headings", () => {
    mount(rows, true);
    expect(screen.queryByText("General")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("with an empty box, shows recent tabs first and actions under their fixed groups", () => {
    mount(rows, false);
    const t = titles();
    expect(t[0]).toContain("my tab");
    expect(t.findIndex((x) => x.includes("Open settings"))).toBeLessThan(
      t.findIndex((x) => x.includes("Appearance settings")),
    );
    expect(screen.getByText("Recent tabs")).toBeTruthy();
    expect(screen.getByText("General")).toBeTruthy();
  });
});
