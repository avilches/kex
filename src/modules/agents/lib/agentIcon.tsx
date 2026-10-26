import { RoboticIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import claudeCodeUrl from "@/modules/agents/assets/claudecode-color.svg";
import geminiCliUrl from "@/modules/agents/assets/geminicli-color.svg";
import ompUrl from "@/modules/agents/assets/omp-color.svg";
import agyUrl from "@/modules/agents/assets/agy.svg";
import grokUrl from "@/modules/agents/assets/grok.svg";
import openClaudeUrl from "@/modules/agents/assets/openclaude.png";

// By exact id, so an unknown agent whose name contains a known one gets the generic icon.
const SVG_URLS = new Map([
  ["claude", claudeCodeUrl],
  ["gemini", geminiCliUrl],
  ["omp", ompUrl],
  ["agy", agyUrl],
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

// The Goose mark from lobehub icons (MIT), drawn inline so it follows the text color.
function GooseMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="goose" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M21.595 23.61c1.167-.254 2.405-.944 2.405-.944l-2.167-1.784a12.124 12.124 0 01-2.695-3.131 12.127 12.127 0 00-3.97-4.049l-.794-.462a1.115 1.115 0 01-.488-.815.844.844 0 01.154-.575c.413-.582 2.548-3.115 2.94-3.44.503-.416 1.065-.762 1.586-1.159.074-.056.148-.112.221-.17.003-.002.007-.004.009-.007.167-.131.325-.272.45-.438.453-.524.563-.988.59-1.193-.061-.197-.244-.639-.753-1.148.319.02.705.272 1.056.569.235-.376.481-.773.727-1.171.165-.266-.08-.465-.086-.471h-.001V3.22c-.007-.007-.206-.25-.471-.086-.567.35-1.134.702-1.639 1.021 0 0-.597-.012-1.305.599a2.464 2.464 0 00-.438.45l-.007.009c-.058.072-.114.147-.17.221-.397.521-.743 1.083-1.16 1.587-.323.391-2.857 2.526-3.44 2.94a.842.842 0 01-.574.153 1.115 1.115 0 01-.815-.488l-.462-.794a12.123 12.123 0 00-4.049-3.97 12.133 12.133 0 01-3.13-2.695L1.332 0S.643 1.238.39 2.405c.352.428 1.27 1.49 2.34 2.302C1.58 4.167.73 3.75.06 3.4c-.103.765-.063 1.92.043 2.816.726.317 1.961.806 3.219 1.066-1.006.236-2.11.278-2.961.262.15.554.358 1.119.64 1.688.119.263.25.52.39.77.452.125 2.222.383 3.164.171l-2.51.897a27.776 27.776 0 002.544 2.726c2.031-1.092 2.494-1.241 4.018-2.238-2.467 2.008-3.108 2.828-3.8 3.67l-.483.678c-.25.351-.469.725-.65 1.117-.61 1.31-1.47 4.1-1.47 4.1-.154.486.202.842.674.674 0 0 2.79-.861 4.1-1.47.392-.182.766-.4 1.118-.65l.677-.483c.227-.187.453-.37.701-.586 0 0 1.705 2.02 3.458 3.349l.896-2.511c-.211.942.046 2.712.17 3.163.252.142.509.272.772.392.569.28 1.134.49 1.688.64-.016-.853.026-1.956.261-2.962.26 1.258.75 2.493 1.067 3.219.895.106 2.051.146 2.816.043a73.87 73.87 0 01-1.308-2.67c.811 1.07 1.874 1.988 2.302 2.34h-.001z" />
    </InlineMark>
  );
}

// The Cursor cube, the same mark as the editor icon, drawn inline so it follows the text color.
function CursorMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="cursor" viewBox="0 0 32 32">
      <path fillRule="evenodd" d="m16 30 12-20v14zM4 10l12-8 12 8zm0 0 12 6v14L4 24z" />
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
  if (id === "goose") return <GooseMark size={size} className={className} />;
  if (id === "aider") return <AiderMark size={size} className={className} />;
  if (id === "cursor-agent") return <CursorMark size={size} className={className} />;

  const svgUrl = SVG_URLS.get(id);
  if (svgUrl) {
    return (
      <img
        src={svgUrl}
        alt={agent}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: "contain" }}
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
