import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { warn } from "@tauri-apps/plugin-log";

function logWarn(message: string) {
  void warn(message).catch(() => {});
}

// navigator.clipboard.writeText was seen failing in WebKit with NotAllowedError
// even with the window focused (TASK-828), so writes use the native pasteboard.
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await writeText(text);
    return true;
  } catch (err) {
    logWarn(`[clipboard] native writeText failed: ${String(err)}`);
    return false;
  }
}

// navigator.clipboard.readText makes WebKit show a system "Paste" bubble when
// the read does not come from a keyboard gesture (a context menu click), so
// menu-driven pastes read the native pasteboard instead.
export async function readClipboardText(): Promise<string | null> {
  try {
    return await readText();
  } catch (err) {
    logWarn(`[clipboard] native readText failed: ${String(err)}`);
    return null;
  }
}
