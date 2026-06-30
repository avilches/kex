import { type RefObject, useCallback, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { native } from "@/lib/native";
import type { Workspace } from "@/modules/workspaces";
import { allPanes } from "@/modules/workspaces";
import {
  getWslHome,
  LOCAL_WORKSPACE,
  type WorkspaceEnv,
} from "@/modules/workspace";

type Params = {
  workspacesRef: RefObject<Workspace[]>;
  workspaceEnv: WorkspaceEnv;
  setWorkspaceEnv: (env: WorkspaceEnv) => void;
  resetToHome: (home?: string) => void;
  /** Dispose live sessions and clear App-owned pane/handle ref maps. */
  clearWorkspaceState: () => void;
};

/**
 * Owns the resolved home / launch cwd and the local⇄WSL workspace switch. The
 * switch tears down live sessions (via clearWorkspaceState), re-authorizes the
 * new home, and resets the workspace state.
 */
export function useWorkspaceSwitcher({
  workspacesRef,
  workspaceEnv,
  setWorkspaceEnv,
  resetToHome,
  clearWorkspaceState,
}: Params) {
  const [home, setHome] = useState<string | null>(null);
  const [launchCwd, setLaunchCwd] = useState<string | null>(null);
  const [launchCwdResolved, setLaunchCwdResolved] = useState(false);

  useEffect(() => {
    homeDir()
      .then(async (p) => {
        const normalized = p.replace(/\\/g, "/");
        setHome(normalized);
        try {
          await native.workspaceAuthorize(normalized);
        } catch {
          // Bootstrap already authorizes home from Rust; ignore.
        }
      })
      .catch(() => setHome(null));
  }, []);

  useEffect(() => {
    native
      .workspaceCurrentDir()
      .then(setLaunchCwd)
      .catch(() => setLaunchCwd(null))
      .finally(() => setLaunchCwdResolved(true));
  }, []);

  const switchWorkspace = useCallback(
    async (env: WorkspaceEnv) => {
      if (
        env.kind === workspaceEnv.kind &&
        (env.kind === "local" ||
          (workspaceEnv.kind === "wsl" && env.distro === workspaceEnv.distro))
      ) {
        return;
      }
      const dirty = workspacesRef.current.some((ws) =>
        allPanes(ws.paneTree).some((p) =>
          p.tabs.some((tab) => tab.kind === "editor" && tab.dirty),
        ),
      );
      if (dirty) {
        window.alert(
          "Save or close unsaved editor tabs before switching workspace.",
        );
        return;
      }

      let nextHome: string | null = null;
      try {
        if (env.kind === "wsl") {
          nextHome = await getWslHome(env.distro);
        } else {
          nextHome = (await homeDir()).replace(/\\/g, "/");
        }
      } catch (e) {
        window.alert(String(e));
        return;
      }

      clearWorkspaceState();
      setWorkspaceEnv(env.kind === "local" ? LOCAL_WORKSPACE : env);
      setHome(nextHome);
      setLaunchCwd(nextHome);
      if (nextHome) {
        try {
          await native.workspaceAuthorize(nextHome);
        } catch {
          // Non-fatal — git panel will surface "not authorized" if needed.
        }
      }
      resetToHome(nextHome ?? undefined);
    },
    [
      workspaceEnv,
      setWorkspaceEnv,
      resetToHome,
      workspacesRef,
      clearWorkspaceState,
    ],
  );

  return { home, launchCwd, launchCwdResolved, switchWorkspace };
}
