// xterm.js stores each scrollback line as a Uint32Array(cols * 3): content,
// fg, bg per cell (@xterm/xterm src/common/buffer/BufferLine.ts, CELL_SIZE =
// 3), 4 bytes per entry. Real terminals vary in width, so this is an
// estimate at a reference width, used to turn a memory budget (Settings)
// into how many background terminals stay parked instead of torn down.
const BYTES_PER_CELL = 12;

export const BACKGROUND_MEMORY_REFERENCE_COLS = 120;

export function estimateTerminalBytes(
  scrollbackLines: number,
  cols: number = BACKGROUND_MEMORY_REFERENCE_COLS,
): number {
  return Math.max(0, scrollbackLines) * Math.max(0, cols) * BYTES_PER_CELL;
}

export function estimateParkedTerminalBudget(
  memoryBudgetBytes: number,
  scrollbackLines: number,
  cols: number = BACKGROUND_MEMORY_REFERENCE_COLS,
): number {
  if (memoryBudgetBytes <= 0) return 0;
  const perTerminal = estimateTerminalBytes(scrollbackLines, cols);
  if (perTerminal <= 0) return 0;
  return Math.floor(memoryBudgetBytes / perTerminal);
}
