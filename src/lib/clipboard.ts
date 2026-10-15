import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { warn } from "@tauri-apps/plugin-log";
import { toast } from "sonner";

const PREVIEW_CHARS = 60;

function preview(s: string): string {
  const flat = s.replace(/\s+/g, " ");
  const cut = flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}...` : flat;
  return `"${cut}" (${s.length} chars)`;
}

function logWarn(message: string) {
  void warn(message).catch(() => {});
}

// TEMPORARY diagnostic (TASK-834): reads the pasteboard back after every copy
// and toasts whether it holds what was written. Remove it, and the
// clipboard-manager:allow-read-text permission, once copies are confirmed.
async function verifyClipboard(expected: string) {
  try {
    const actual = await readText();
    if (actual === expected) {
      toast.success(`Clipboard verified (${expected.length} chars)`);
      return;
    }
    logWarn(
      `[clipboard] mismatch: expected ${expected.length} chars, clipboard has ${actual.length} chars`,
    );
    toast.error("Clipboard differs from what was copied", {
      description: `expected ${preview(expected)} | got ${preview(actual)}`,
    });
  } catch (err) {
    logWarn(`[clipboard] read-back failed: ${String(err)}`);
    toast.error("Could not read the clipboard back", { description: String(err) });
  }
}

// navigator.clipboard.writeText was seen failing in WebKit with NotAllowedError
// even with the window focused (TASK-828), so writes use the native pasteboard.
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await writeText(text);
  } catch (err) {
    logWarn(`[clipboard] native writeText failed: ${String(err)}`);
    return false;
  }
  void verifyClipboard(text);
  return true;
}
