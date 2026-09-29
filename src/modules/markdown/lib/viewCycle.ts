export function nextViewMode<T>(modes: readonly T[], current: T): T {
  const i = modes.indexOf(current);
  return modes[(i + 1) % modes.length];
}
