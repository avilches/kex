import type { SessionPreview } from "@/modules/agents/lib/agentSessionRestore";
import { formatHibernatedFor } from "./hibernate";

export type SessionPreviewLine = {
  message: string | null;
  meta: string;
  // Full folder and the absolute time, for the native tooltip of the meta line.
  metaTitle: string;
};

export function tildePath(path: string, home: string | null): string {
  const p = path.replace(/\\/g, "/");
  if (!home) return p;
  if (p === home) return "~";
  return p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p;
}

export function describeSessionPreview(
  preview: SessionPreview,
  nowMs: number,
  home: string | null,
): SessionPreviewLine {
  const parts: string[] = [];
  if (preview.cwd) parts.push(tildePath(preview.cwd, home));
  const at = preview.updatedAt * 1000;
  if (preview.updatedAt > 0) parts.push(`${formatHibernatedFor(nowMs - at)} ago`);
  const titleParts = [preview.cwd, preview.updatedAt > 0 ? new Date(at).toLocaleString() : ""];
  return {
    message: preview.lastMessage?.trim() || null,
    meta: parts.join(" · "),
    metaTitle: titleParts.filter(Boolean).join("\n"),
  };
}

// Keyed by tab id; the IPC is skipped while the same set of terminal tabs is asked for again.
export function previewRequestKey(tabIds: readonly string[]): string {
  return [...tabIds].sort().join("\n");
}
