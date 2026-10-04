import type { TerminalPalette } from "@/modules/theme/types";

const ANSI_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

export function TerminalThemePreview({ palette }: { palette: TerminalPalette | undefined }) {
  const bg = palette?.background ?? "var(--background)";
  const fg = palette?.foreground ?? "var(--foreground)";
  const ansi = palette?.ansi;
  const color = (i: number) => ansi?.[i] ?? fg;
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border/60 p-2 font-mono text-[11.5px] leading-[1.5]"
      style={{ background: bg, color: fg }}
    >
      <div className="whitespace-pre">
        <span style={{ color: color(2) }}>~/kex</span> <span style={{ color: color(4) }}>main</span>
        {" ❯ git status"}
      </div>
      <div className="whitespace-pre" style={{ color: color(1) }}>
        {"        modified:   src/app.ts"}
      </div>
      <div className="whitespace-pre" style={{ color: color(2) }}>
        {"        new file:   src/theme.ts"}
      </div>
      <div className="whitespace-pre">
        <span style={{ color: color(3) }}>warning:</span> LF will be replaced by CRLF{" "}
        <span style={{ background: palette?.selection ?? "var(--accent)" }}>selected</span>
        <span
          className="ml-0.5 inline-block w-[7px] align-middle"
          style={{ background: palette?.cursor ?? fg, height: "1.1em" }}
        />
      </div>
      {ansi ? (
        <>
          <div className="flex gap-1">
            {ANSI_NAMES.map((n, i) => (
              <span key={n} title={n} className="h-3.5 flex-1 rounded-sm" style={{ background: ansi[i] }} />
            ))}
          </div>
          <div className="flex gap-1">
            {ANSI_NAMES.map((n, i) => (
              <span
                key={n}
                title={`bright ${n}`}
                className="h-3.5 flex-1 rounded-sm"
                style={{ background: ansi[i + 8] }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
