import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IS_MAC } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { Cancel01Icon, MoreHorizontalIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { chipLabel, finish, showChip } from "./lib/onboardingState";
import { persistOnboarding } from "./lib/persistOnboarding";
import { openOnboarding } from "./onboardingUi";

export function OnboardingChip({ isMac = IS_MAC }: { isMac?: boolean }) {
  const state = usePreferencesStore((s) => s.onboarding);
  if (!showChip(state)) return null;
  const label = chipLabel(state, isMac);

  return (
    <div className="flex h-8 shrink-0 items-stretch self-center overflow-hidden rounded-md border border-border/70 bg-background/40">
      <Button
        variant="ghost"
        size="sm"
        className="h-full gap-1.5 rounded-none border-0 px-2 focus-visible:ring-0 focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50 text-[11px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Pick up the setup where you left it"
        onClick={openOnboarding}
      >
        <HugeiconsIcon icon={SparklesIcon} size={13} strokeWidth={1.75} className="text-primary" />
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Setup options"
            title="Setup options"
            className="h-full w-6 rounded-none border-0 border-l border-border/70 focus-visible:ring-0 focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={13} strokeWidth={1.75} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => persistOnboarding(finish)}>
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
            Dismiss setup
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
