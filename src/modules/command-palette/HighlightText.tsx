import type { ReactNode } from "react";

// Splits the text at the matched indices and bolds the runs that cover them, VS Code style.
export function HighlightText({
  text,
  indices,
}: {
  text: string;
  indices: number[] | undefined;
}) {
  if (!indices || indices.length === 0 || text.length === 0) return <>{text}</>;
  const set = new Set(indices);
  const parts: ReactNode[] = [];
  let run = "";
  let start = 0;
  let runMatched = false;
  const flush = () => {
    if (!run) return;
    parts.push(
      runMatched ? (
        <b key={start} className="font-semibold">
          {run}
        </b>
      ) : (
        <span key={start}>{run}</span>
      ),
    );
  };
  for (let i = 0; i < text.length; i++) {
    const matched = set.has(i);
    if (matched !== runMatched) {
      flush();
      start = i;
      run = "";
      runMatched = matched;
    }
    run += text[i];
  }
  flush();
  return <>{parts}</>;
}
