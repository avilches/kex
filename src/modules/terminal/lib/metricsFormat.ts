export function formatCpu(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped.toFixed(1)}%`;
}

export function formatMem(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`;
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}
