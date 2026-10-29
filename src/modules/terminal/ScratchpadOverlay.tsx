import { ScratchpadBar } from "./ScratchpadBar";

// The wrapper ignores the pointer so a click on the dimmed terminal still
// reaches it and dismisses the scratchpad through setLeafTerminalFocused.
export function ScratchpadOverlay({ leafId }: { leafId: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end bg-black/30 px-8 pb-20">
      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col">
        <ScratchpadBar leafId={leafId} />
      </div>
    </div>
  );
}
