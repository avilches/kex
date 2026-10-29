import { useEffect, useState } from "react";
import { getRunningSince } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { formatElapsed } from "./lib/metricsFormat";

// Only mounted while a command runs, so the one-second tick costs nothing the
// rest of the time and re-renders just this span.
export function RunningTimer({ tabId }: { tabId: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const since = getRunningSince(tabId);
  if (since === null) return null;
  return <span title="Running for">{formatElapsed(now - since)}</span>;
}
