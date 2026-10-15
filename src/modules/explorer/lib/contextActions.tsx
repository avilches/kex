import { writeClipboardText } from "@/lib/clipboard";
import { IS_MAC } from "@/lib/platform";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ClipboardCopyIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

export const REVEAL_LABEL = IS_MAC
  ? "Reveal in Finder"
  : "Reveal in File Manager";

export async function copyToClipboard(text: string, label?: string): Promise<void> {
  if (!(await writeClipboardText(text))) {
    toast.error("Copy failed");
    return;
  }
  if (label)
    toast.success(label, {
      description: text,
      icon: <HugeiconsIcon icon={ClipboardCopyIcon} size={16} strokeWidth={1.5} />,
    });
}

export function relativePath(rootPath: string, path: string): string {
  if (path === rootPath) return ".";
  if (path.startsWith(`${rootPath}/`)) return path.slice(rootPath.length + 1);
  return path;
}

export const OPEN_EXTERNAL_LABEL = "Open with Default App";

export async function openWithDefaultApp(path: string): Promise<void> {
  try {
    await openPath(path);
  } catch (e) {
    console.error("openPath failed:", e);
    toast.error("Could not open the file", { description: String(e) });
  }
}

export async function revealInFinder(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch (e) {
    console.error("revealItemInDir failed:", e);
  }
}
