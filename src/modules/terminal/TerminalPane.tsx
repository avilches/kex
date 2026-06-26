import { useTheme } from "@/modules/theme";
import type { SearchAddon } from "@xterm/addon-search";
import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { BlockOverlay } from "./block/BlockOverlay";
import { BlockWatermark } from "./block/BlockWatermark";
import {
  focusLeafInput,
  interruptLeaf,
  leafCwd,
  submitToLeaf,
  useTerminalSession,
} from "./lib/useTerminalSession";
import { ScratchpadBar } from "./ScratchpadBar";

// Lazy: ShellInput pulls the CodeMirror stack, which must stay out of the
// eager startup bundle (see eager-budget.test.ts). It loads only when a block
// terminal is actually opened.
const ShellInput = lazy(() => import("./block/ShellInput"));

export type TerminalPaneHandle = {
  write: (data: string) => void;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
};

type Props = {
  /** Stable identifier for this panel (passed back through callbacks). */
  panelId: string;
  /** Tab containing this pane is on screen. */
  visible: boolean;
  /** This panel is the active pane within its tab — receives auto-focus. */
  focused?: boolean;
  initialCwd?: string;
  /** Enable command-block decorations (OSC 133) for this terminal. */
  blocks?: boolean;
  /** "Run on start": resume the agent or run the saved command on first spawn. */
  restoreOnRestart?: boolean;
  persistentCommand?: string;
  onSearchReady?: (panelId: string, addon: SearchAddon) => void;
  onExit?: (panelId: string, code: number) => void;
  onCwd?: (panelId: string, cwd: string) => void;
  onRunningCommand?: (panelId: string, cmd: string | null) => void;
};

export const TerminalPane = forwardRef<TerminalPaneHandle, Props>(
  function TerminalPane(
    {
      panelId,
      visible,
      focused = true,
      initialCwd,
      blocks = false,
      restoreOnRestart,
      persistentCommand,
      onSearchReady,
      onExit,
      onCwd,
      onRunningCommand,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const downYRef = useRef<number | null>(null);
    const { resolvedMode, themeId, customThemes } = useTheme();

    const session = useTerminalSession({
      leafId: panelId,
      container: containerRef,
      visible,
      focused,
      initialCwd,
      blocks,
      restoreOnRestart,
      persistentCommand,
      onSearchReady: (a) => onSearchReady?.(panelId, a),
      onExit: (c) => onExit?.(panelId, c),
      onCwd: (c) => onCwd?.(panelId, c),
      onRunningCommand: (cmd) => onRunningCommand?.(panelId, cmd),
    });

    useEffect(() => {
      // Defer one frame so CSS-variable token resolution sees the new class.
      const id = requestAnimationFrame(() => session.applyTheme());
      return () => cancelAnimationFrame(id);
    }, [resolvedMode, themeId, customThemes, session]);

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => session.write(data),
        focus: () => session.focus(),
        getBuffer: (max?: number) => session.getBuffer(max),
        getSelection: () => session.getSelection(),
      }),
      [session],
    );

    const hideStyle = {
      visibility: visible ? ("visible" as const) : ("hidden" as const),
      pointerEvents: visible ? ("auto" as const) : ("none" as const),
    };

    if (blocks) {
      return (
        <div
          className="zoom-exempt flex h-full w-full flex-col"
          style={hideStyle}
        >
          <div className="relative min-h-0 flex-1">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: terminal surface; pointer selects command blocks */}
            <div
              ref={containerRef}
              className="absolute inset-0 z-0"
              onMouseDown={(e) => {
                downYRef.current = e.clientY;
              }}
              onMouseUp={(e) => {
                const moved =
                  downYRef.current != null &&
                  Math.abs(e.clientY - downYRef.current) > 4;
                downYRef.current = null;
                if (!moved) session.selectBlockAt(e.clientY);
                if (session.blockMode === "prompt") focusLeafInput(panelId);
              }}
            />
            <BlockWatermark leafId={panelId} subscribe={session.subscribeBlocks} />
            <BlockOverlay
              subscribe={session.subscribeBlocks}
              getVisible={session.visibleBlocks}
              readOutput={(id) => session.readBlockId(id)?.output ?? null}
              searchBlock={session.searchBlock}
              revealMatch={session.revealMatch}
              clearSearch={session.clearSearch}
              promptReady={session.blockMode === "prompt"}
              onRunAgain={(cmd) => submitToLeaf(panelId, cmd)}
              onRestoreFocus={() => focusLeafInput(panelId)}
            />
          </div>
          <div className="shrink-0 border-t border-border/40 px-3 py-2">
            <Suspense fallback={null}>
              <ShellInput
                leafId={panelId}
                mode={session.blockMode}
                focused={focused}
                themeKey={`${themeId}:${resolvedMode}`}
                onSubmit={(text) => submitToLeaf(panelId, text)}
                onInterrupt={() => interruptLeaf(panelId)}
                getCwd={() => leafCwd(panelId)}
              />
            </Suspense>
          </div>
          {session.scratchpadOpen && <ScratchpadBar leafId={panelId} />}
        </div>
      );
    }

    return (
      <div className="zoom-exempt flex h-full w-full flex-col" style={hideStyle}>
        <div ref={containerRef} className="min-h-0 flex-1" />
        {session.scratchpadOpen && <ScratchpadBar leafId={panelId} />}
      </div>
    );
  },
);
