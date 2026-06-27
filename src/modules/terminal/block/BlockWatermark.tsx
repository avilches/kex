import { Kbd, ShortcutKeys } from "@/components/Kbd";
import type { ShortcutId } from "@/modules/shortcuts";
import { cn } from "@/lib/utils";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  blockWatermarkState,
  type WatermarkState,
} from "../lib/useTerminalSession";

type Props = {
  leafId: string;
  subscribe: (cb: () => void) => () => void;
};

const NOOP_SUBSCRIBE = () => () => {};
const DEAD = (): WatermarkState => "dead";

// First-run hints over an untouched block terminal. Once the leaf runs a
// command the component unmounts for good and drops its subscription.
export function BlockWatermark({ leafId, subscribe }: Props) {
  const [gone, setGone] = useState(false);
  const state = useSyncExternalStore(
    gone ? NOOP_SUBSCRIBE : subscribe,
    gone ? DEAD : () => blockWatermarkState(leafId),
  );

  useEffect(() => {
    if (gone || state !== "dead") return;
    const t = setTimeout(() => setGone(true), 600);
    return () => clearTimeout(t);
  }, [state, gone]);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-[5] flex select-none flex-col items-center justify-center gap-8",
        "transition-[opacity,transform] duration-500 ease-out",
        state === "visible"
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
      )}
    >
      <img
        src="/logo.png"
        alt=""
        draggable={false}
        className="size-24 rounded-3xl shadow-lg shadow-black/25"
      />
      <div className="grid grid-cols-[auto_auto] items-center gap-x-12 gap-y-3 text-[13px]">
        <Hint label="Browse your command history" keys="↑" />
        <Hint label="Autocomplete paths and commands" keys="Tab" />
        <Hint label="Previous command block" shortcut="blocks.prev" />
        <Hint label="Next command block" shortcut="blocks.next" />
        <Hint label="New block terminal" shortcut="tab.newBlock" />
      </div>
    </div>
  );
}

function Hint(props: { label: string; keys?: string; shortcut?: ShortcutId }) {
  return (
    <>
      <span className="justify-self-start text-muted-foreground">
        {props.label}
      </span>
      <span className="flex items-center gap-1 justify-self-end">
        {props.shortcut ? (
          <ShortcutKeys id={props.shortcut} />
        ) : (
          <Kbd>{props.keys}</Kbd>
        )}
      </span>
    </>
  );
}
