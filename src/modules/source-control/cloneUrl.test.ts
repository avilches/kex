import { describe, expect, it } from "vitest";
import { isSafeGitCloneUrl } from "./cloneUrl";

describe("isSafeGitCloneUrl", () => {
  it("accepts valid https, ssh and scp-like URLs", () => {
    expect(isSafeGitCloneUrl("https://github.com/user/repo.git")).toBe(true);
    expect(isSafeGitCloneUrl("http://localhost:8080/path/repo.git")).toBe(true);
    expect(isSafeGitCloneUrl("ssh://git@host:2222/user/repo.git")).toBe(true);
    expect(isSafeGitCloneUrl("git@github.com:user/repo.git")).toBe(true);
  });

  it("rejects leading dash that could be a git option", () => {
    expect(isSafeGitCloneUrl("--upload-pack=calc")).toBe(false);
    expect(isSafeGitCloneUrl("-foo/bar")).toBe(false);
  });

  it("rejects shell metacharacters anywhere in the URL", () => {
    expect(isSafeGitCloneUrl("https://x/repo.git;touch /tmp/pwned")).toBe(false);
    expect(isSafeGitCloneUrl("$(touch /tmp/pwned)")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/repo.git`touch`")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/a|b")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/a&b")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/a&ls")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/a>b")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/a<b")).toBe(false);
  });

  it("rejects quotes, backslashes and whitespace", () => {
    expect(isSafeGitCloneUrl('https://x/repo.git"')).toBe(false);
    expect(isSafeGitCloneUrl("https://x/repo.git'")).toBe(false);
    expect(isSafeGitCloneUrl("https:/\\x/repo.git")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/a b")).toBe(false);
    expect(isSafeGitCloneUrl("https://x/a\nb")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isSafeGitCloneUrl("")).toBe(false);
    expect(isSafeGitCloneUrl("   ")).toBe(false);
  });
});
