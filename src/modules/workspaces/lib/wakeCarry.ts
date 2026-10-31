import type { SleepingTab } from "./hibernate";
import type { HibernateIndicator } from "./hibernateIndicator";

export type WakeCarry = { agent?: string; indicator?: HibernateIndicator };

// What a tab slept with, kept after it wakes because waking drops `hibernation` and the agent's live session
// only exists again once the agent has restarted. Until then the palette and the switcher read it from here.
const carried = new Map<string, WakeCarry>();

export function carryOnWake(tabs: readonly SleepingTab[]): void {
  for (const t of tabs) {
    const { agent, indicator } = t.hibernation;
    if (!agent && !indicator) continue;
    carried.set(t.id, { ...(agent ? { agent } : {}), ...(indicator ? { indicator } : {}) });
  }
}

export function wakeCarryOf(tabId: string): WakeCarry | undefined {
  return carried.get(tabId);
}

export function dropWakeCarry(tabId: string): void {
  carried.delete(tabId);
}

export function resetWakeCarry(): void {
  carried.clear();
}
