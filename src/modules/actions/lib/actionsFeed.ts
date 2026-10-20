import { useEffect, useState } from "react";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ACTIONS_ATTACH_EVENT,
  ACTIONS_DETACH_EVENT,
  ACTIONS_EDIT_EVENT,
  ACTIONS_PUSH_EVENT,
  type ActionsEdit,
  type ActionsPush,
} from "./actionsLink";

// The workspace side of the link: this hook runs in the Settings window, which reads
// what the main window pushes of the Actions of its current workspace and edits them
// with operations the main window applies to its stores.
export function useWorkspaceActionsFeed(): { feed: ActionsPush | null; send: (edit: ActionsEdit) => void } {
  const [feed, setFeed] = useState<ActionsPush | null>(null);
  useEffect(() => {
    const unlisten: UnlistenFn[] = [];
    void emit(ACTIONS_ATTACH_EVENT);
    // The attach event can outrun the main window's listener (a boot-restored Settings
    // window beats the app mount), so it is repeated while this side is alive.
    const heartbeat = setInterval(() => void emit(ACTIONS_ATTACH_EVENT), 15_000);
    void listen<ActionsPush>(ACTIONS_PUSH_EVENT, (e) => setFeed(e.payload)).then((u) => unlisten.push(u));
    return () => {
      clearInterval(heartbeat);
      void emit(ACTIONS_DETACH_EVENT);
      for (const u of unlisten) u();
    };
  }, []);
  const send = (edit: ActionsEdit) => {
    void emit(ACTIONS_EDIT_EVENT, edit);
  };
  return { feed, send };
}
