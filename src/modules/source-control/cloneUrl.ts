const URL_SAFE = /^[A-Za-z0-9@._~:/?#[\]!*+,=%-]+$/;

export const CLONE_URL_LABEL = "URL contains invalid characters";

export function isSafeGitCloneUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("-")) return false;
  return URL_SAFE.test(trimmed);
}
