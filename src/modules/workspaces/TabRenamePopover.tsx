import { type ReactNode, useEffect, useRef } from "react";
import type React from "react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { type RenameOrigin, isRenamingAt, useTabRenameStore } from "./lib/tabRenameStore";

type Props = {
  tabId: string;
  origin: RenameOrigin;
  title: string | undefined;
  placeholder: string;
  onRenameTab?: (tabId: string, title: string | undefined) => void;
  // Contains the PopoverAnchor the field is positioned against.
  children: ReactNode;
};

// The rename field of a tab, shared by the pane tab and the sidebar row. Both
// mount one; only the one whose origin matches the store opens.
export function TabRenamePopover({ tabId, origin, title, placeholder, onRenameTab, children }: Props) {
  const isRenaming = useTabRenameStore((s) => isRenamingAt(s, tabId, origin));
  const clearRename = useTabRenameStore((s) => s.clearRename);
  const saveSeq = useTabRenameStore((s) => s.saveSeq);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const handledRef = useRef(false);
  const seenSaveSeq = useRef(saveSeq);

  useEffect(() => {
    if (isRenaming) handledRef.current = false;
  }, [isRenaming]);

  function handleSave() {
    if (handledRef.current) return;
    handledRef.current = true;
    const next = (inputRef.current?.value ?? "").trim();
    onRenameTab?.(tabId, next || undefined);
    clearRename();
  }

  function handleCancel() {
    if (handledRef.current) return;
    handledRef.current = true;
    clearRename();
  }

  function handleBlur(e: React.FocusEvent) {
    if (popoverRef.current?.contains(e.relatedTarget as Node | null)) return;
    handleSave();
  }

  useEffect(() => {
    if (saveSeq === seenSaveSeq.current) return;
    seenSaveSeq.current = saveSeq;
    if (isRenaming) handleSave();
  });

  return (
    <Popover
      open={isRenaming}
      onOpenChange={(open) => {
        if (!open) handleSave();
      }}
    >
      {children}
      <PopoverContent
        ref={popoverRef}
        side="bottom"
        align="start"
        sideOffset={4}
        className="flex w-52 flex-col gap-1 rounded-lg p-2"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          handleCancel();
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <span className="text-[12px] text-muted-foreground">Rename tab</span>
        <input
          ref={inputRef}
          autoFocus
          onFocus={(e) => {
            e.stopPropagation();
            e.currentTarget.select();
          }}
          onBlur={handleBlur}
          defaultValue={title ?? ""}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full rounded border border-input bg-transparent px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring placeholder:text-muted-foreground/60"
        />
      </PopoverContent>
    </Popover>
  );
}
