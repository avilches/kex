type FileLinkHandler = (
  path: string,
  cwd: string | null,
  line?: number,
  col?: number,
  sourcePanelId?: string,
) => void;

let _handler: FileLinkHandler | null = null;
let _cwdResolver: ((leafId: string) => string | null) | null = null;

export function configureTerminalLinkBridge(opts: {
  onFileLink: FileLinkHandler;
  resolveLeafCwd: (leafId: string) => string | null;
}): void {
  _handler = opts.onFileLink;
  _cwdResolver = opts.resolveLeafCwd;
}

export function dispatchFileLink(
  path: string,
  cwd: string | null,
  line?: number,
  col?: number,
  sourcePanelId?: string,
): void {
  _handler?.(path, cwd, line, col, sourcePanelId);
}

export function getLeafCwd(leafId: string | null): string | null {
  return leafId ? (_cwdResolver?.(leafId) ?? null) : null;
}
