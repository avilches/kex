import { Button } from "@/components/ui/button";

type Props = { onWake: () => void; active: boolean };

export function HibernatedOverlay({ onWake, active }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/95 text-muted-foreground">
      <span className="select-none text-5xl font-light tracking-widest">Zzzzz</span>
      <Button variant="outline" size="sm" onClick={onWake} autoFocus={active}>
        Restore
      </Button>
    </div>
  );
}
