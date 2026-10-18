// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(undefined)) }));

import { BellIntegrationRow } from "./NotificationBell";
import type { IntegrationState } from "@/modules/agents/lib/useIntegration";

afterEach(cleanup);

function state(over: Partial<IntegrationState> = {}): IntegrationState {
  return {
    ready: false,
    busy: false,
    failed: false,
    install: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(),
    ...over,
  };
}

describe("BellIntegrationRow", () => {
  it("offers the install while the integration is missing", () => {
    const s = state();
    render(<BellIntegrationRow agent="pi" name="Pi" state={s} />);
    fireEvent.click(screen.getByText("Install Pi integration"));
    expect(s.install).toHaveBeenCalledTimes(1);
  });

  it("is hidden once the integration is installed", () => {
    const { container } = render(
      <BellIntegrationRow agent="pi" name="Pi" state={state({ ready: true })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("is shown while the first status check is still pending", () => {
    render(<BellIntegrationRow agent="omp" name="OMP" state={state({ ready: null })} />);
    expect(screen.getByText("Install OMP integration")).toBeTruthy();
  });

  it("disables the button and says so while it works", () => {
    render(<BellIntegrationRow agent="omp" name="OMP" state={state({ busy: true })} />);
    expect(screen.getByText("Installing...")).toBeTruthy();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains a failed install", () => {
    render(<BellIntegrationRow agent="opencode" name="OpenCode" state={state({ failed: true })} />);
    expect(screen.getByText(/Could not write the OpenCode integration/)).toBeTruthy();
  });
});
