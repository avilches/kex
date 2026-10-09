import {
  CopySlashIcon,
  File01Icon,
  FolderOpenIcon,
  Link01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EditorView } from "@codemirror/view";
import { type PointerEvent, type ReactNode, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { IS_MAC } from "@/lib/platform";
import {
  copyToClipboard,
  OPEN_EXTERNAL_LABEL,
  openWithDefaultApp,
  REVEAL_LABEL,
  revealInFinder,
} from "@/modules/explorer/lib/contextActions";
import { COMPACT_CONTENT, COMPACT_ITEM } from "@/modules/explorer/lib/menuItemClass";
import { wikiTargetAt } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import type { WikiLinkMenuHost, WikiNoteInfo } from "@/modules/markdown/lib/useWikiLinkHost";

// Right-click menu for a `[[Note]]` that points at an existing note. Anywhere
// else (text, a missing note) the trigger stays disabled so the platform menu
// still appears. The target is read on pointerdown, which fires before
// `contextmenu`, because the trigger must be enabled or not by then.
export function WikiLinkContextMenu({
  host,
  children,
}: {
  host: WikiLinkMenuHost | undefined;
  children: ReactNode;
}) {
  const [note, setNote] = useState<WikiNoteInfo | null>(null);

  const onPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    const isContextClick = e.button === 2 || (IS_MAC && e.button === 0 && e.ctrlKey);
    if (!isContextClick || !host || !(e.target instanceof Node)) return;
    const view = EditorView.findFromDOM(e.target as HTMLElement);
    const pos = view?.posAtCoords({ x: e.clientX, y: e.clientY });
    const target = view && pos != null ? wikiTargetAt(view.state, pos) : null;
    setNote(target === null ? null : host.infoFor(target));
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={note === null} className="select-text">
        <div className="h-full" onPointerDownCapture={onPointerDownCapture}>
          {children}
        </div>
      </ContextMenuTrigger>
      {note && host ? (
        <ContextMenuContent className={COMPACT_CONTENT}>
          <ContextMenuItem className={COMPACT_ITEM} onSelect={() => host.openPath(note.path)}>
            <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={2} />
            {note.isOpen ? "Go to Tab" : "Open in New Tab"}
          </ContextMenuItem>
          <ContextMenuItem className={COMPACT_ITEM} onSelect={() => void openWithDefaultApp(note.path)}>
            <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={2} />
            {OPEN_EXTERNAL_LABEL}
          </ContextMenuItem>
          <ContextMenuItem className={COMPACT_ITEM} onSelect={() => void revealInFinder(note.path)}>
            <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} />
            {REVEAL_LABEL}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(note.path, "Copied absolute path")}
          >
            <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
            Copy Absolute Path
          </ContextMenuItem>
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(note.relativePath, "Copied relative path")}
          >
            <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
            Copy Relative Path
          </ContextMenuItem>
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
}
