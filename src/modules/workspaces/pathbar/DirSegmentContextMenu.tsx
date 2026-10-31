import type React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { COMPACT_CONTENT } from "@/modules/explorer/lib/menuItemClass";
import { dirSegmentMenuItems, type DirSegmentMenuDeps } from "./segmentMenuItems";

type Props = { children: React.ReactNode } & DirSegmentMenuDeps;

export function DirSegmentContextMenu({ children, ...deps }: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
        {dirSegmentMenuItems(deps)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
