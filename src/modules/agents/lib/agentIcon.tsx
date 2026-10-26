import { RoboticIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import claudeCodeUrl from "@/modules/agents/assets/claudecode-color.svg";
import geminiCliUrl from "@/modules/agents/assets/geminicli-color.svg";
import ompUrl from "@/modules/agents/assets/omp-color.svg";
import agyUrl from "@/modules/agents/assets/agy.png";
import cursorAgentUrl from "@/modules/agents/assets/cursor-agent.png";
import gooseUrl from "@/modules/agents/assets/goose.png";
import grokUrl from "@/modules/agents/assets/grok.png";
import openClaudeUrl from "@/modules/agents/assets/openclaude.png";

// By exact id, so an unknown agent whose name contains a known one gets the generic icon.
const SVG_URLS = new Map([
  ["claude", claudeCodeUrl],
  ["gemini", geminiCliUrl],
  ["omp", ompUrl],
  ["agy", agyUrl],
  ["cursor-agent", cursorAgentUrl],
  ["goose", gooseUrl],
  ["grok", grokUrl],
  ["openclaude", openClaudeUrl],
]);

// Marks drawn inline follow the text color, which an <img> cannot: a monochrome logo loaded
// through <img> renders black and disappears on dark themes.
function InlineMark({
  size,
  className,
  label,
  viewBox,
  children,
}: {
  size: number;
  className?: string;
  label: string;
  viewBox: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      fill="currentColor"
      aria-label={label}
      role="img"
      className={className}
    >
      {children}
    </svg>
  );
}

function PiMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="pi" viewBox="0 0 560 560">
      <path d="M420 280H280V140H0V0H420V280Z" />
      <path d="M560 560H420V280H560V560Z" />
      <path d="M140 560H0V140H140V280H280V420H140V560Z" />
    </InlineMark>
  );
}

// The official mark is a frame with a lighter block in its lower half; the two tones become
// the text color at full and reduced strength so it reads on any theme.
function OpenCodeMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="opencode" viewBox="0 0 240 300">
      <path d="M180 240H60V120H180V240Z" opacity={0.45} />
      <path fillRule="evenodd" d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" />
    </InlineMark>
  );
}

// The aider.chat pinned-tab mark, drawn inline so it follows the text color.
function AiderMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="aider" viewBox="0 0 436 436">
      <g transform="translate(0,436) scale(0.1,-0.1)" stroke="none">
        <path d="M0 2180 l0 -2180 2180 0 2180 0 0 2180 0 2180 -2180 0 -2180 0 0 -2180z m2705 1818 c20 -20 28 -121 30 -398 l2 -305 216 -5 c118 -3 218 -8 222 -12 3 -3 10 -46 15 -95 5 -48 16 -126 25 -172 17 -86 17 -81 -17 -233 -14 -67 -13 -365 2 -438 21 -100 22 -159 5 -247 -24 -122 -24 -363 1 -458 23 -88 23 -213 1 -330 -9 -49 -17 -109 -17 -132 l0 -43 203 0 c111 0 208 -4 216 -9 10 -6 18 -51 27 -148 8 -76 16 -152 20 -168 7 -39 -23 -361 -37 -387 -10 -18 -21 -19 -214 -16 -135 2 -208 7 -215 14 -22 22 -33 301 -21 501 6 102 8 189 5 194 -8 13 -417 12 -431 -2 -12 -12 -8 -146 8 -261 8 -55 8 -95 1 -140 -6 -35 -14 -99 -17 -143 -9 -123 -14 -141 -41 -154 -18 -8 -217 -11 -679 -11 l-653 0 -11 33 c-31 97 -43 336 -27 533 5 56 6 113 2 128 l-6 26 -194 0 c-211 0 -252 4 -261 28 -12 33 -17 392 -6 522 15 186 -2 174 260 180 115 3 213 8 217 12 4 4 1 52 -5 105 -7 54 -17 130 -22 168 -7 56 -5 91 11 171 10 55 22 130 26 166 4 36 10 72 15 79 7 12 128 15 665 19 l658 5 8 30 c5 18 4 72 -3 130 -12 115 -7 346 11 454 10 61 10 75 -1 82 -8 5 -300 9 -650 9 l-636 0 -27 25 c-18 16 -26 34 -26 57 0 18 -5 87 -10 153 -10 128 5 449 22 472 5 7 26 13 46 15 78 6 1281 3 1287 -4z" />
        <path d="M1360 1833 c0 -5 -1 -164 -3 -356 l-2 -347 625 -1 c704 -1 708 -1 722 7 5 4 7 20 4 38 -29 141 -32 491 -6 595 9 38 8 45 -7 57 -15 11 -139 13 -675 14 -362 0 -658 -3 -658 -7z" />
      </g>
    </InlineMark>
  );
}

// The OpenAI mark, drawn inline so it follows the text color.
function CodexMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="codex" viewBox="0 0 24 24">
      <path d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-.141-.085-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z" />
    </InlineMark>
  );
}

export function AgentIcon({
  agent,
  size = 15,
  className,
}: {
  agent: string;
  size?: number;
  className?: string;
}) {
  const id = agent.toLowerCase();
  if (id === "kex") {
    return (
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size }}
      />
    );
  }

  if (id === "pi") return <PiMark size={size} className={className} />;
  if (id === "opencode") return <OpenCodeMark size={size} className={className} />;
  if (id === "codex") return <CodexMark size={size} className={className} />;
  if (id === "aider") return <AiderMark size={size} className={className} />;

  const svgUrl = SVG_URLS.get(id);
  if (svgUrl) {
    return (
      <img
        src={svgUrl}
        alt={agent}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <HugeiconsIcon
      icon={RoboticIcon}
      size={size}
      strokeWidth={1.75}
      className={className}
    />
  );
}

export function StruckAgentIcon({
  agent,
  size,
  title,
}: {
  agent: string;
  size?: number;
  title: string;
}) {
  return (
    <span className="relative inline-flex" title={title}>
      <AgentIcon agent={agent} size={size} />
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[15px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-muted-foreground" />
    </span>
  );
}
