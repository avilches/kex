export type BlockPayload = { holder: string | null };

export function busyForOthers(holder: string | null, own: string): boolean {
  return holder !== null && holder !== own;
}
