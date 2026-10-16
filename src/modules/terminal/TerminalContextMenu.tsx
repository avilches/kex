import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { readClipboardText } from "@/lib/clipboard";
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
import { COMPACT_CONTENT, COMPACT_ITEM } from "@/modules/explorer/lib/menuItemClass";
import { ClipboardIcon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  getSelection: () => string | null;
  onPaste: (text: string) => void;
  onClosed: () => void;
};

export function TerminalContextMenu({
  children,
  getSelection,
  onPaste,
  onClosed,
}: Props) {
  const [selection, setSelection] = useState<string | null>(null);

  const paste = () => {
    void readClipboardText().then((text) => {
      if (text) onPaste(text);
    });
  };

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) setSelection(getSelection());
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className={COMPACT_CONTENT}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <ContextMenuItem
          className={COMPACT_ITEM}
          disabled={selection == null}
          onSelect={() => {
            if (selection != null) void copyToClipboard(selection);
          }}
        >
          <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
          Copy
        </ContextMenuItem>
        <ContextMenuItem className={COMPACT_ITEM} onSelect={paste}>
          <HugeiconsIcon icon={ClipboardIcon} size={14} strokeWidth={2} />
          Paste
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
