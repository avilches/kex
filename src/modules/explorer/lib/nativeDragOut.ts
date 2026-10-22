import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { fileIconUrl, folderIconUrl } from "@/modules/explorer/lib/iconResolver";
import { tabFilePath } from "@/modules/workspaces/lib/tabPath";
import type { Tab } from "@/modules/workspaces/lib/types";

const ICON_SIZE = 64;
// The OS reports the drop after the drag session callback or before it, so the
// paths stay recognised for a moment after the session ends.
const OWN_DRAG_GRACE_MS = 1000;

let ownPaths: ReadonlySet<string> = new Set();

const canonical = (path: string) => path.replace(/\\/g, "/");

export function pointerLeftWindow(x: number, y: number, width: number, height: number): boolean {
  return x < 0 || y < 0 || x >= width || y >= height;
}

export function tabNativeDragPath(tab: Tab): string | null {
  return tab.kind === "editor" || tab.kind === "markdown" ? tabFilePath(tab) : null;
}

// True while the dropped paths are the ones this window handed to the OS itself,
// so landing back on Kex must not copy them or paste them into a terminal.
export function isOwnNativeDrag(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every((p) => ownPaths.has(canonical(p)));
}

export async function renderDragIcon(path: string, isDir: boolean): Promise<string> {
  const name = path.split(/[\\/]/).pop() ?? path;
  const img = new Image();
  img.src = isDir ? folderIconUrl(name, false) : fileIconUrl(name);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.getContext("2d")?.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);
  return canvas.toDataURL("image/png");
}

export async function startNativeFileDrag(path: string, icon: Promise<string>): Promise<void> {
  ownPaths = new Set([canonical(path)]);
  try {
    await startDrag({ item: [path], icon: await icon }, () => {
      setTimeout(() => {
        ownPaths = new Set();
      }, OWN_DRAG_GRACE_MS);
    });
  } catch (err) {
    ownPaths = new Set();
    throw err;
  }
}
