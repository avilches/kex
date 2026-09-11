export function hasMermaidFence(md: string): boolean {
  return /^(?:```|~~~)\s*mermaid\b/m.test(md);
}
