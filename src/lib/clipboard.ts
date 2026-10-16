import { writeText } from "@tauri-apps/plugin-clipboard-manager";
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
