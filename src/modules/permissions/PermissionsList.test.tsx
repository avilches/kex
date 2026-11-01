// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const permissionProbe = vi.fn();
const permissionOpenSettings = vi.fn();
vi.mock("@/lib/native", () => ({
  native: {
    permissionProbe: (k: string) => permissionProbe(k),
    permissionOpenSettings: (k: string) => permissionOpenSettings(k),
  },
}));

import { PermissionsList } from "./PermissionsList";

beforeEach(() => {
  permissionProbe.mockReset();
  permissionOpenSettings.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("PermissionsList", () => {
  it("check all probes every kind and shows the result", async () => {
    permissionProbe.mockImplementation((k: string) =>
      Promise.resolve(k === "downloads" ? "denied" : k === "icloud" ? "unavailable" : "granted"),
    );
    render(<PermissionsList />);
    fireEvent.click(screen.getByRole("button", { name: "Check all" }));
    await waitFor(() => expect(screen.getAllByText("Granted")).toHaveLength(3));
    expect(permissionProbe.mock.calls.map((c) => c[0]).sort()).toEqual([
      "desktop",
      "documents",
      "downloads",
      "fullDisk",
      "icloud",
    ]);
    expect(screen.getByText("Denied")).toBeTruthy();
    expect(screen.getByText("Not present")).toBeTruthy();
  });

  it("a denied row offers Open System Settings and calls permissionOpenSettings with its kind", async () => {
    permissionProbe.mockImplementation((k: string) =>
      Promise.resolve(k === "documents" ? "denied" : "granted"),
    );
    render(<PermissionsList />);
    fireEvent.click(screen.getByRole("button", { name: "Check all" }));
    const open = await screen.findByRole("button", { name: "Open System Settings" });
    fireEvent.click(open);
    expect(permissionOpenSettings).toHaveBeenCalledWith("documents");
    expect(screen.queryByRole("button", { name: /ask again/i })).toBeNull();
  });

  it("an unavailable row is dimmed and offers nothing", async () => {
    permissionProbe.mockResolvedValue("unavailable");
    render(<PermissionsList />);
    fireEvent.click(screen.getByRole("button", { name: "Check all" }));
    await waitFor(() => expect(screen.getAllByText("Not present")).toHaveLength(5));
    expect(screen.getByTestId("permission-icloud").className).toContain("opacity-50");
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open System Settings" })).toBeNull();
  });

  it("a single Check probes only that kind", async () => {
    permissionProbe.mockResolvedValue("granted");
    render(<PermissionsList />);
    fireEvent.click(screen.getAllByRole("button", { name: "Check" })[1]);
    await waitFor(() => expect(screen.getByText("Granted")).toBeTruthy());
    expect(permissionProbe).toHaveBeenCalledTimes(1);
    expect(permissionProbe).toHaveBeenCalledWith("documents");
  });
});
