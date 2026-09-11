import type { MarkdownTabMode } from "@/modules/markdown/lib/markdownTabShell";

export function shouldRegisterMilkdownBaseline(state: {
  mode: MarkdownTabMode;
  readyRevision: number | null;
  editorReady: boolean;
}): boolean {
  return state.mode === "rich" && state.readyRevision !== null && state.editorReady;
}
