const BODY_MAX = 140;
const TITLE_MAX = 60;

function clamp(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function toastTitle(title: string): string {
  return clamp(title, TITLE_MAX);
}

export function toastBody(body: string | undefined): string | undefined {
  if (!body) return undefined;
  return clamp(body, BODY_MAX);
}
