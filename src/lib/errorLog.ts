import { error as logError } from "@tauri-apps/plugin-log";
import type { RootOptions } from "react-dom/client";

const MAX_LEN = 4000;
const MAX_STACK_FRAMES = 12;
const MAX_COMPONENT_FRAMES = 25;
const MAX_CAUSE_DEPTH = 3;

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter((l) => l.trim() !== "");
}

function head(lines: string[], max: number): string {
  const kept = lines.slice(0, max).join("\n");
  return lines.length > max
    ? `${kept}\n  ... ${lines.length - max} more`
    : kept;
}

// WebKit's `stack` holds only the frames, never the message, so the message is
// written first; V8-style stacks that already start with it are not repeated.
function describeError(err: Error, depth: number): string {
  const message = `${err.name}: ${err.message}`;
  const stack = err.stack ?? "";
  const frames = stack.startsWith(message)
    ? stack.slice(message.length)
    : stack;
  const lines = nonEmptyLines(frames);
  let text = message;
  if (lines.length > 0) text += `\n${head(lines, MAX_STACK_FRAMES)}`;
  const cause = (err as { cause?: unknown }).cause;
  if (cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    text += `\ncaused by: ${describeUnknown(cause, depth + 1)}`;
  }
  return text;
}

function describeUnknown(err: unknown, depth = 0): string {
  if (err instanceof Error) return describeError(err, depth);
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

export function formatError(
  source: string,
  err: unknown,
  componentStack?: string | null,
): string {
  const components = componentStack
    ? `\ncomponent stack:\n${head(nonEmptyLines(componentStack), MAX_COMPONENT_FRAMES)}`
    : "";
  const text = `[webview] ${source}: ${describeUnknown(err)}${components}`;
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}...` : text;
}

function report(source: string, err: unknown, componentStack?: string | null) {
  logError(formatError(source, err, componentStack)).catch(() => {});
}

// React 19 unmounts the whole tree on an uncaught render error, leaving a
// blank window with nothing in the Rust log; these hooks make it leave a trace.
export const reactRootErrorOptions: Pick<
  RootOptions,
  "onUncaughtError" | "onCaughtError" | "onRecoverableError"
> = {
  onUncaughtError: (err, info) =>
    report("uncaught render error", err, info.componentStack),
  onCaughtError: (err, info) =>
    report("render error caught by a boundary", err, info.componentStack),
  onRecoverableError: (err, info) =>
    report("recoverable render error", err, info.componentStack),
};

export function installGlobalErrorLogging() {
  window.addEventListener("error", (e) =>
    report("window error", e.error ?? e.message),
  );
  window.addEventListener("unhandledrejection", (e) =>
    report("unhandled promise rejection", e.reason),
  );
}
