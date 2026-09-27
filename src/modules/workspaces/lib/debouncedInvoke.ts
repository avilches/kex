import { invoke } from "@tauri-apps/api/core";

export type DebouncedInvoke<T> = {
  /** Replaces any pending value and (re)starts the delay; the last value wins. */
  schedule: (value: T) => void;
  /**
   * Cancels the pending delay, if any, and saves the last scheduled value
   * immediately. No-op when nothing is pending (e.g. it already fired).
   */
  flush: () => Promise<void>;
};

/**
 * A debounced Tauri `invoke()`: repeated `schedule()` calls collapse into a
 * single IPC call `delayMs` after the last one, so a drag-resize or a rapid
 * burst of state changes does not write on every tick. `flush()` lets a
 * caller (e.g. on window close) force the last pending value through
 * immediately instead of waiting out the delay.
 */
export function debouncedInvoke<T>(opts: {
  command: string;
  delayMs: number;
  buildArgs: (value: T) => Record<string, unknown>;
  errorTag: string;
}): DebouncedInvoke<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;

  async function run(value: T): Promise<void> {
    await invoke(opts.command, opts.buildArgs(value)).catch((err) =>
      console.error(`[${opts.errorTag}] save error:`, err),
    );
  }

  return {
    schedule(value: T) {
      pending = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const p = pending;
        pending = null;
        if (p !== null) void run(p);
      }, opts.delayMs);
    },
    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      const p = pending;
      pending = null;
      if (p !== null) await run(p);
    },
  };
}
