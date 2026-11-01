import { Spinner } from "@/components/ui/spinner";
import { lazy, Suspense } from "react";

// Lazy so the agents list stays out of the main window bundle until this step is reached.
const AgentIntegrations = lazy(() =>
  import("@/settings/sections/AgentIntegrations").then((m) => ({ default: m.AgentIntegrations })),
);

export function AgentsStep() {
  return (
    <Suspense
      fallback={
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Spinner size={16} />
        </div>
      }
    >
      <AgentIntegrations />
    </Suspense>
  );
}
