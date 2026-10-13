import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
  className,
}: {
  workspaceId: string;
  mode: AutoHibernate;
  className?: string;
}) {
  const now = useSecondClock();
  const remaining = autoHibernateRemainingMs(activityStamps.get(workspaceId), mode, now);
  if (remaining === null) return null;
  return (
    <span
      title="Time left until auto-hibernate (dev only)"
      className={cn(
        "pointer-events-none absolute top-1/2 z-10 w-[30px] -translate-y-1/2 text-right text-[10px] font-normal tabular-nums text-muted-foreground opacity-60",
        className,
      )}
    >
      {formatCountdown(remaining)}
    </span>
  );
}
