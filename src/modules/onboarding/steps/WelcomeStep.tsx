import { FolderLockedIcon, PaintBoardIcon, RoboticIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Item = { icon: typeof PaintBoardIcon; title: string; text: string };

export function WelcomeStep({ isMac }: { isMac: boolean }) {
  const items: Item[] = [
    { icon: PaintBoardIcon, title: "Your style", text: "How the explorer opens files and colors git changes." },
    ...(isMac
      ? [
          {
            icon: FolderLockedIcon,
            title: "Folder access",
            text: "So the agents you run in Kex can read your Desktop, Documents and Downloads.",
          },
        ]
      : []),
    {
      icon: RoboticIcon,
      title: "Coding agents",
      text: "A live spinner, a nudge when they need you, and sessions that survive closing a tab.",
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.title} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-medium">{item.title}</span>
            <span className="text-[12px] leading-relaxed text-muted-foreground">{item.text}</span>
          </div>
        </div>
      ))}
      <p className="text-[12px] text-muted-foreground">
        It takes about a minute, and every step can be skipped.
      </p>
    </div>
  );
}
