import type React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { COMPACT_CONTENT } from "@/modules/explorer/lib/menuItemClass";
import { fileLeafMenuItems, type FileLeafMenuDeps } from "./segmentMenuItems";
import { RowActionsMenu } from "@/modules/actions/RowActionsMenu";

type Props = { children: React.ReactNode } & FileLeafMenuDeps;

export function FileLeafContextMenu({ children, ...deps }: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
        <RowActionsMenu kind="file" path={deps.path} />
        {fileLeafMenuItems(deps)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
