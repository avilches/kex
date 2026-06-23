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
