export type RevealAction = "rename" | "duplicate" | "delete";

export function dispatchRevealAction(
  action: RevealAction,
  file: string,
  isDir: boolean,
  handlers: {
    beginRename: (path: string) => void;
    beginDuplicate: (path: string, kind: "file" | "dir") => void;
    requestDelete: (path: string, isDir: boolean) => void;
  },
): void {
  if (action === "rename") handlers.beginRename(file);
  else if (action === "duplicate") handlers.beginDuplicate(file, isDir ? "dir" : "file");
  else if (action === "delete") handlers.requestDelete(file, isDir);
}
