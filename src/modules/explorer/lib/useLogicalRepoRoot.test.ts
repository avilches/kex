import { beforeEach, describe, expect, it, vi } from "vitest";

const gitResolveRepo = vi.hoisted(() => vi.fn());
const canonicalize = vi.hoisted(() => vi.fn());
vi.mock("@/lib/native", () => ({ native: { gitResolveRepo, canonicalize } }));

import { resolveLogicalRepoRoot } from "./useLogicalRepoRoot";

beforeEach(() => {
  gitResolveRepo.mockReset();
  canonicalize.mockReset();
});

describe("resolveLogicalRepoRoot", () => {
  it("maps the real repository root back onto the path the folder was opened through", async () => {
    gitResolveRepo.mockResolvedValue({ repoRoot: "/Volumes/vault/proj" });
    canonicalize.mockResolvedValue("/Volumes/vault/proj/src");
    expect(await resolveLogicalRepoRoot("/Users/me/Hub/Data/proj/src")).toBe("/Users/me/Hub/Data/proj");
  });

  it("returns the root as it is when no symlink is involved", async () => {
    gitResolveRepo.mockResolvedValue({ repoRoot: "/w/app" });
    canonicalize.mockResolvedValue("/w/app/src");
    expect(await resolveLogicalRepoRoot("/w/app/src")).toBe("/w/app");
  });

  it("is null outside a repository or when git fails", async () => {
    gitResolveRepo.mockResolvedValue(null);
    canonicalize.mockResolvedValue("/x");
    expect(await resolveLogicalRepoRoot("/x")).toBeNull();
    gitResolveRepo.mockRejectedValue(new Error("no git"));
    expect(await resolveLogicalRepoRoot("/x")).toBeNull();
  });
});
