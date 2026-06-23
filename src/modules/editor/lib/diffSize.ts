// Guard against mounting the synchronous merge view on inputs that make the
// diff computation expensive. Two independent axes matter: total bytes and line
// count. A minified bundle is tiny per line yet has tens of thousands of lines,
// so a bytes-only threshold lets it through and stalls the UI.
const LARGE_FILE_BYTES = 256 * 1024;
const LARGE_FILE_LINES = 5000;

export function countLines(s: string): number {
  let lines = 1;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

export function isDiffTooLarge(original: string, modified: string): boolean {
  return (
    original.length > LARGE_FILE_BYTES ||
    modified.length > LARGE_FILE_BYTES ||
    countLines(original) > LARGE_FILE_LINES ||
    countLines(modified) > LARGE_FILE_LINES
  );
}

// Cap how much of the fallback patch is rendered. The patch view dumps raw text
// into the DOM without virtualization, so a large diff would mount tens of
// thousands of lines. Show the first maxLines and report how many are hidden.
export const PATCH_PREVIEW_MAX_LINES = 500;

export function clampPatchPreview(
  patch: string,
  maxLines = PATCH_PREVIEW_MAX_LINES,
): { text: string; hiddenLines: number } {
  let newlines = 0;
  let cutIdx = -1;
  for (let i = 0; i < patch.length; i++) {
    if (patch.charCodeAt(i) === 10) {
      newlines++;
      if (newlines === maxLines && cutIdx === -1) cutIdx = i;
    }
  }
  if (cutIdx === -1) return { text: patch, hiddenLines: 0 };
  const totalLines =
    patch.charCodeAt(patch.length - 1) === 10 ? newlines : newlines + 1;
  return { text: patch.slice(0, cutIdx), hiddenLines: totalLines - maxLines };
}
