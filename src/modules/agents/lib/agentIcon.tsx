import { RoboticIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import claudeCodeUrl from "@/modules/agents/assets/claudecode-color.svg";
import geminiCliUrl from "@/modules/agents/assets/geminicli-color.svg";
import ompUrl from "@/modules/agents/assets/omp-color.svg";

// By exact id, so an unknown agent whose name contains a known one gets the generic icon.
const SVG_URLS = new Map([["claude", claudeCodeUrl], ["gemini", geminiCliUrl], ["omp", ompUrl]]);

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
