import { useEffect, useState } from "react";
import {
  autoHibernateRemainingMs,
  formatCountdown,
  type AutoHibernate,
} from "@/modules/workspaces/lib/autoHibernate";
import { activityStamps } from "@/modules/workspaces/lib/workspaceState";

function useSecondClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function AutoHibernateCountdown({
  workspaceId,
  mode,
}: {
  workspaceId: string;
  mode: AutoHibernate;
}) {
  const now = useSecondClock();
  const remaining = autoHibernateRemainingMs(activityStamps.get(workspaceId), mode, now);
  if (remaining === null) return null;
  return (
    <span className="pointer-events-none ml-auto shrink-0 pl-1 pr-1 text-[10px] font-normal tabular-nums text-muted-foreground opacity-60">
      {formatCountdown(remaining)}
    </span>
  );
}
