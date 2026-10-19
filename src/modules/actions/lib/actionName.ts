const SUFFIX = /\s*\{[a-z]+\}$/;

/** An app preset name is "Name {variable}"; wherever it is painted the variable goes on
 * its own line. */
export function splitActionName(name: string): { main: string; variable: string | null } {
  const match = name.match(SUFFIX);
  if (!match) return { main: name, variable: null };
  return { main: name.slice(0, match.index).trimEnd(), variable: match[0].trim() };
}
