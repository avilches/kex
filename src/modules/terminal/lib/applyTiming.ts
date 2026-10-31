export type ApplyStep = "set" | "fit" | "resize";

type SlotRecord = {
  leaf: string | null;
  set: number;
  fit: number;
  resize: number;
};

export type ApplyTimer = {
  begin(leafId: string | null): void;
  lap(step: ApplyStep): void;
  /** One log line, or null when no slot was touched. */
  line(): string | null;
};

const round = (n: number) => Math.round(n * 10) / 10;

export function createApplyTimer(option: string, now: () => number): ApplyTimer {
  const start = now();
  const records: SlotRecord[] = [];
  let mark = start;

  return {
    begin(leafId) {
      records.push({ leaf: leafId, set: 0, fit: 0, resize: 0 });
      mark = now();
    },
    lap(step) {
      const current = records[records.length - 1];
      if (!current) return;
      const t = now();
      current[step] += t - mark;
      mark = t;
    },
    line() {
      if (records.length === 0) return null;
      return `[term-apply] ${JSON.stringify({
        option,
        totalMs: round(now() - start),
        slots: records.length,
        visible: records.filter((r) => r.leaf !== null).length,
        perSlot: records.map((r) => ({
          leaf: r.leaf,
          set: round(r.set),
          fit: round(r.fit),
          resize: round(r.resize),
        })),
      })}`;
    },
  };
}
