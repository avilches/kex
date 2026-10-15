export const ZOOM_LEVELS = [0.95, 1.0, 1.05, 1.1] as const;
export const DEFAULT_ZOOM = 1.05;

export function nearestZoomIndex(z: number): number {
  let best = 0;
  for (let i = 1; i < ZOOM_LEVELS.length; i++) {
    if (Math.abs(ZOOM_LEVELS[i] - z) < Math.abs(ZOOM_LEVELS[best] - z)) best = i;
  }
  return best;
}

export function snapZoom(z: number): number {
  return ZOOM_LEVELS[nearestZoomIndex(z)];
}

export function stepZoom(current: number, direction: 1 | -1): number {
  const i = nearestZoomIndex(current) + direction;
  return ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i))];
}
