import { error as logError } from "@tauri-apps/plugin-log";
import type { RootOptions } from "react-dom/client";

const MAX_LEN = 4000;

export function formatError(
  source: string,
  err: unknown,
  componentStack?: string | null,
): string {
  let detail: string;
  if (err instanceof Error) {
    detail = err.stack ?? `${err.name}: ${err.message}`;
  } else {
    try {
      detail = typeof err === "string" ? err : JSON.stringify(err);
    } catch {
      detail = String(err);
    }
  }
  const stack = componentStack ? `\ncomponent stack:${componentStack}` : "";
  const text = `[webview] ${source}: ${detail}${stack}`;
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
