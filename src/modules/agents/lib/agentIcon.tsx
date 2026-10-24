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

// The official mark is a cloud outline with a prompt inside; as an inline path it follows the text color.
function CodexMark({ size, className }: { size: number; className?: string }) {
  return (
    <InlineMark size={size} className={className} label="codex" viewBox="0 0 600 600">
      <path fillRule="evenodd" d="M353 568C406 561 451 526 470 479L472 472L479 470C533 447 569 394 569 334C570 301 561 273 542 247L535 237L536 227C539 200 534 171 521 144C494 90 433 57 373 64L363 65L358 61C319 31 269 22 222 37C184 49 153 76 135 113L127 128L119 131C77 149 43 191 33 236C25 277 34 321 58 353L65 362L64 370C60 414 72 453 99 485C129 522 181 542 228 536L237 535L246 541C276 564 316 574 353 568ZM314 524C293 521 276 512 262 499C250 489 247 488 233 491C220 495 198 494 185 491C130 476 97 423 108 368C111 351 111 349 97 334C90 325 80 306 77 294C63 239 92 185 146 168C160 163 163 161 167 147C192 73 281 49 337 101C348 110 354 112 366 108C369 108 377 107 383 106C445 103 496 154 493 216C492 222 491 229 491 232C487 246 489 252 497 261C550 319 525 411 450 433C440 436 435 441 432 450C422 486 394 513 358 523C346 526 325 527 314 524ZM419 388C435 380 435 358 419 349L414 346L368 346L321 346L316 350C300 359 302 380 319 389C321 390 332 390 368 390L415 390L419 388ZM211 388C218 386 221 382 243 346C267 305 267 305 267 298C266 294 264 290 246 258C219 214 220 215 214 212C198 205 182 216 183 233C184 239 184 240 202 270L220 300L202 329C183 362 182 364 184 373C188 385 199 391 211 388Z" />
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
