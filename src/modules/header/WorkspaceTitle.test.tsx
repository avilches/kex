// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SleepingTab } from "@/modules/workspaces/lib/hibernate";
import type { Tab } from "@/modules/workspaces/lib/types";
import { WorkspaceTitle } from "./WorkspaceTitle";

afterEach(cleanup);

const workspace = { id: "ws-1", title: "Kex", icon: undefined, color: undefined, groupId: undefined, cwd: "/p/Kex", workspaceRoot: "/p/Kex" };

const asleep = (indicator?: "attention" | "error"): SleepingTab => ({
  id: "t1",
  kind: "terminal",
  title: "api",
  hibernation: { at: 1, indicator },
});

const subtitleRow = () => screen.getByText("api").parentElement as HTMLElement;

describe("WorkspaceTitle tab line", () => {
  it("dims the name of a sleeping tab, then its dimmed sleeping icon with the dot laid over it", () => {
    render(<WorkspaceTitle workspace={workspace} tab={asleep("attention")} groups={[]} />);
    const name = screen.getByText("api");
    const icon = screen.getByLabelText("Tab is hibernated");
    const dot = subtitleRow().querySelector("[data-indicator-dot]")!;
    expect(name.className).toContain("opacity-40");
    expect(icon.className).toContain("opacity-40");
    expect(name.nextElementSibling).toBe(icon.parentElement);
    expect(icon.parentElement!.contains(dot)).toBe(true);
    expect(dot.className).toContain("bg-amber-400");
    expect(dot.className).not.toContain("opacity");
  });

  it("shows a red dot for a tab that slept with an error", () => {
    render(<WorkspaceTitle workspace={workspace} tab={asleep("error")} groups={[]} />);
    expect(subtitleRow().querySelector("[data-indicator-dot]")!.className).toContain("bg-destructive");
  });

  it("shows only the dimmed icon for a sleeping tab with no dot", () => {
    render(<WorkspaceTitle workspace={workspace} tab={asleep()} groups={[]} />);
    expect(screen.getByLabelText("Tab is hibernated")).toBeTruthy();
    expect(subtitleRow().querySelector("[data-indicator-dot]")).toBeNull();
  });

  it("puts the blue unsaved dot right after the name of a dirty file", () => {
    const file: Tab = { id: "f1", kind: "editor", path: "/p/api.ts", title: "api", dirty: true, preview: false };
    render(<WorkspaceTitle workspace={workspace} tab={file} groups={[]} />);
    expect(screen.getByText("api").nextElementSibling).toBe(screen.getByLabelText("Unsaved changes"));
  });

  it("leaves the name of an awake tab at full strength and without the sleeping icon", () => {
    const awake: Tab = { id: "t2", kind: "terminal", title: "api" };
    render(<WorkspaceTitle workspace={workspace} tab={awake} groups={[]} />);
    expect(screen.getByText("api").className).not.toContain("opacity");
    expect(screen.queryByLabelText("Tab is hibernated")).toBeNull();
  });
});
