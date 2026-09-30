import { getName } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export function DevBranchBadge() {
  const [branch, setBranch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if ((await getName()) !== "Kex Dev") return;
      const info = await invoke<{ hash: string; branch: string }>(
        "get_build_info",
      );
      if (!cancelled && info.branch && info.branch !== "unknown") {
        setBranch(info.branch);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!branch) return null;
  return (
    <span
      title={`Development build, branch ${branch}`}
      className="max-w-48 shrink truncate font-mono text-[11px] text-muted-foreground"
    >
      {branch}
    </span>
  );
}
