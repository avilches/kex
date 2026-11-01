import type { IncomingMessage } from "node:http";

// The dev-only endpoints write files of the repo, so a page open in the same browser must not be able to
// reach them: a cross-site form or fetch carries a foreign Origin, and a rebinding attack a foreign Host.

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

/** Why a write request must be refused, or null when it comes from the local dev page. */
export function refuseWrite(req: Pick<IncomingMessage, "headers">): string | null {
  const type = String(req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") return "Content-Type must be application/json";
  const origin = req.headers.origin;
  if (typeof origin !== "string") return "Origin is required";
  const originHost = hostnameOf(origin);
  if (!originHost || !LOOPBACK.test(originHost)) return "Origin is not local";
  const host = req.headers.host;
  const hostName = typeof host === "string" ? hostnameOf(host) : null;
  if (!hostName || !LOOPBACK.test(hostName)) return "Host is not local";
  return null;
}

// What a color token may be: hex, or a color function with plain arguments. Anything else would be written
// inside a string literal of a .ts file.
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([0-9a-z%.,\s/+-]{1,80}\))$/i;

export function isColorValue(value: unknown): value is string {
  return typeof value === "string" && COLOR.test(value);
}
