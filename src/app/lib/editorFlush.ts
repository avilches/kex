// Bridge so the window-close handler in main.tsx can flush dirty editors
// before the workspace state is persisted and the window is destroyed.
// App registers the flush fn while mounted; main.tsx invokes it on close.

let flushFn: (() => Promise<void>) | null = null;

export function setEditorFlush(fn: (() => Promise<void>) | null): void {
  flushFn = fn;
}

export async function flushEditors(): Promise<void> {
  await flushFn?.();
}
