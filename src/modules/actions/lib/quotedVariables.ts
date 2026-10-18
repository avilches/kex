import { titleVariablesUsed } from "@/modules/workspaces/lib/titleTemplate";

export type ScanShell = "posix" | "powershell";

// PowerShell reads the typographic quotes as quotes too.
const PS_DOUBLE = '"“”„';
const PS_SINGLE = "'‘’‚‛";

type Ctx = "dq" | "sq" | "ansi" | "cmd";

// Names of the known variables a script places where Kex's own quoting cannot protect
// them: inside quotes the user wrote (the value would be quoted twice and, in double
// quotes, a $(...) in it would run), in a heredoc body (expanded as text), or right after
// an escape character (which would eat the opening quote of the value). Tracked: single,
// double and $'...' quotes, $(...) nesting (a quote inside it is its own context), comments
// and heredoc bodies, and for PowerShell the typographic quotes, the backtick and <# #>.
// Names that are not known variables stay literal in the output and are never reported
// (`awk '{print}' {cwd}`). It is a scanner, not a parser: expandCommandShell backs it up
// with a rule on the values themselves.
export function quotedVariables(
  command: string,
  shell: ScanShell,
  isKnown: (name: string) => boolean,
): string[] {
  const ps = shell === "powershell";
  const esc = ps ? "`" : "\\";
  const n = command.length;
  const found = new Set<string>();
  const stack: Ctx[] = [];
  const depths: number[] = [];
  const heredocs: { word: string; strip: boolean }[] = [];
  const isDouble = (c: string) => (ps ? PS_DOUBLE.includes(c) : c === '"');
  const isSingle = (c: string) => (ps ? PS_SINGLE.includes(c) : c === "'");

  const groupAt = (i: number): { end: number; names: string[] } | null => {
    let depth = 0;
    for (let j = i; j < n; j++) {
      const c = command.charAt(j);
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        const names = [...titleVariablesUsed(command.slice(i, j + 1))].filter(isKnown);
        return names.length > 0 ? { end: j, names } : null;
      }
    }
    return null;
  };

  const flagBody = (from: number, to: number) => {
    for (let k = from; k < to; k++) {
      if (command.charAt(k) !== "{") continue;
      if (command.charAt(k + 1) === "{") {
        k++;
        continue;
      }
      const g = groupAt(k);
      if (g) {
        for (const name of g.names) found.add(name);
        k = g.end;
      }
    }
  };

  const pushCmd = () => {
    stack.push("cmd");
    depths.push(1);
  };

  for (let i = 0; i < n; i++) {
    const ch = command.charAt(i);
    const next = command.charAt(i + 1);
    const prev = i > 0 ? command.charAt(i - 1) : "";
    const t = stack[stack.length - 1];

    if (ch === "{") {
      if (next === "{") {
        i++;
        continue;
      }
      const g = groupAt(i);
      if (g && (t === "dq" || t === "sq" || t === "ansi" || prev === esc)) {
        for (const name of g.names) found.add(name);
        i = g.end;
      }
      continue;
    }

    if (ch === esc && t !== "sq" && next !== "" && next !== "{" && (t !== "dq" || ps || '$`"\\\n'.includes(next))) {
      i++;
      continue;
    }

    if (t === "sq") {
      if (isSingle(ch)) stack.pop();
      continue;
    }
    if (t === "ansi") {
      if (ch === "'") stack.pop();
      continue;
    }
    if (t === "dq") {
      if (isDouble(ch)) stack.pop();
      else if (ch === "$" && next === "(") {
        pushCmd();
        i++;
      }
      continue;
    }

    if (isDouble(ch)) stack.push("dq");
    else if (isSingle(ch)) stack.push("sq");
    else if (!ps && ch === "$" && next === "'") {
      stack.push("ansi");
      i++;
    } else if (ch === "$" && next === "(") {
      pushCmd();
      i++;
    } else if (t === "cmd" && ch === "(") depths[depths.length - 1]++;
    else if (t === "cmd" && ch === ")") {
      if (--depths[depths.length - 1] === 0) {
        stack.pop();
        depths.pop();
      }
    } else if (ch === "#" && (i === 0 || /[\s;&|(]/.test(prev))) {
      while (i + 1 < n && command.charAt(i + 1) !== "\n") i++;
    } else if (ps && ch === "<" && next === "#") {
      const end = command.indexOf("#>", i + 2);
      i = end === -1 ? n : end + 1;
    } else if (!ps && ch === "<" && next === "<" && prev !== "<" && command.charAt(i + 2) !== "<") {
      const m = /^<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|([A-Za-z0-9_]+))/.exec(command.slice(i));
      if (m) {
        heredocs.push({ word: m[2] ?? m[3] ?? m[4] ?? "", strip: m[1] === "-" });
        i += m[0].length - 1;
      }
    } else if (ch === "\n" && heredocs.length > 0) {
      let pos = i + 1;
      for (const h of heredocs.splice(0)) {
        while (pos < n) {
          let end = command.indexOf("\n", pos);
          if (end === -1) end = n;
          const line = command.slice(pos, end);
          const done = (h.strip ? line.replace(/^\t+/, "") : line) === h.word;
          if (!done) flagBody(pos, end);
          pos = end + 1;
          if (done) break;
        }
      }
      i = pos - 1;
    }
  }
  return [...found];
}
