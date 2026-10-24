import { RoboticIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import claudeCodeUrl from "@/modules/agents/assets/claudecode-color.svg";
import geminiCliUrl from "@/modules/agents/assets/geminicli-color.svg";
import ompUrl from "@/modules/agents/assets/omp-color.svg";

function svgUrlFor(agent: string): string | null {
  const a = agent.toLowerCase();
  if (a.includes("claude")) return claudeCodeUrl;
  if (a.includes("gemini")) return geminiCliUrl;
  if (a === "omp") return ompUrl;
  return null;
}

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

function isCodex(agent: string): boolean {
  return agent.includes("codex") || agent.includes("gpt") || agent.includes("openai");
}

// Kex's own mark for Codex, a terminal prompt in a frame, not the vendor's logo.
function CodexMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="codex" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        d="M5 1h14a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4Zm0 2.5A1.5 1.5 0 0 0 3.5 5v14A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5V5A1.5 1.5 0 0 0 19 3.5H5Z"
      />
      <path d="M6.4 8.2 8.2 6.4 13.8 12l-5.6 5.6-1.8-1.8 3.8-3.8-3.8-3.8Z" />
      <path d="M13 15.5h5V18h-5v-2.5Z" />
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
  if (agent.toLowerCase().includes("kex")) {
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

  const inline = agent.toLowerCase();
  if (inline === "pi") return <PiMark size={size} className={className} />;
  if (inline === "opencode") return <OpenCodeMark size={size} className={className} />;
  if (isCodex(inline)) return <CodexMark size={size} className={className} />;

  const svgUrl = svgUrlFor(agent);
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
