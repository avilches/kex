import { resolveMonoFontFamily } from "@/lib/fonts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { renderFontSize } from "@/modules/terminal/lib/rendererPool";
import { buildTerminalTheme } from "@/styles/terminalTheme";
import { useEffect, useMemo, useState } from "react";
import { parseAnsi, type StyledLine } from "./lib/hibernateLines";
import { readHibernateLines } from "./lib/hibernateLinesIo";
import { paletteFromTheme, runCss } from "./lib/hibernateLinesStyle";

// The last lines the terminal showed when the tab went to sleep, read again each time the
// placeholder is shown. They sit behind the placeholder, faded: a reminder of where you were,
// not something to read or select.
export function HibernatedLines({ tabId, visible }: { tabId: string; visible: boolean }) {
  const [lines, setLines] = useState<StyledLine[] | null>(null);
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const fontSize = usePreferencesStore((s) => s.terminalFontSize);
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);
  const lineHeight = usePreferencesStore((s) => s.terminalLineHeight);
  const letterSpacing = usePreferencesStore((s) => s.terminalLetterSpacing);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    readHibernateLines(tabId)
      .then((text) => {
        if (!cancelled) setLines(text ? parseAnsi(text) : null);
      })
      .catch(() => {
        if (!cancelled) setLines(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tabId, visible]);

  const palette = useMemo(() => (lines ? paletteFromTheme(buildTerminalTheme()) : null), [lines]);
  if (!lines || !palette) return null;

  return (
    <div
      aria-hidden
      data-testid="hibernated-lines"
      className="pointer-events-none absolute inset-0 flex select-none flex-col justify-end overflow-hidden opacity-25"
      style={{ maskImage: "linear-gradient(to bottom, transparent, black 35%)" }}
    >
      <pre
        className="m-0 px-3 pb-2"
        style={{
          fontFamily: resolveMonoFontFamily(fontFamily),
          fontSize: renderFontSize(fontSize, zoomLevel),
          lineHeight,
          letterSpacing,
          color: palette.foreground,
        }}
      >
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line.length === 0
              ? " "
              : line.map((run, j) => (
                  <span key={j} style={runCss(run.style, palette)}>
                    {run.text}
                  </span>
                ))}
          </div>
        ))}
      </pre>
    </div>
  );
}
