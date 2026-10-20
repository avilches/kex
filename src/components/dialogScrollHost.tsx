import { createContext, useContext, type ReactNode } from "react";

// Render target a popover should portal into when it lives inside a modal Dialog.
type Host = HTMLElement | null;

const DialogScrollHostContext = createContext<Host>(null);

// A modal Dialog scroll-locks the page with a shard around its content only. A popover
// portaled to body sits outside that shard, so its wheel events get preventDefault'd and
// the list cannot scroll (clicks survive since they are not intercepted). Rendering the
// popover inside the dialog content puts it under the shard, where scrolling is allowed.
export function DialogScrollHost({
  content,
  children,
}: {
  content: HTMLElement | null;
  children: ReactNode;
}) {
  return <DialogScrollHostContext.Provider value={content}>{children}</DialogScrollHostContext.Provider>;
}

export function useDialogScrollHost(): HTMLElement | undefined {
  return useContext(DialogScrollHostContext) ?? undefined;
}