const URL_SAFE = /^[A-Za-z0-9@._~:/?#[\]!*+,=%-]+$/;

export const CLONE_URL_LABEL = "URL contains invalid characters";

export function isSafeGitCloneUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("-")) return false;
  return URL_SAFE.test(trimmed);
}

// The command line for the shell that runs the clone. The URL passed the whitelist, which has no quote, so
// single quotes keep `* ? [ ] ! ~ #` literal; the folder is the working directory, hence the dot.
export function cloneCommand(url: string): string {
  return `git clone '${url.trim()}' .`;
}
