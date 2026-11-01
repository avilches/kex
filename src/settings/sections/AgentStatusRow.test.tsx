// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KNOWN_AGENTS } from "@/modules/agents/lib/agentRows";
import { AgentStatusRow } from "./AgentStatusRow";

afterEach(cleanup);

const goose = KNOWN_AGENTS.find((a) => a.id === "goose")!;

describe("AgentStatusRow", () => {
  it("detect-only agents show Detected and no buttons", () => {
    render(<AgentStatusRow agent={goose} state="detectedOnly" />);
    expect(screen.getByText("Detected")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("not detected agents show Not detected, a hint and no buttons", () => {
    render(<AgentStatusRow agent={goose} state="notDetected" />);
    expect(screen.getByText("Not detected")).toBeTruthy();
    expect(screen.getByText(/Install Goose/)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
