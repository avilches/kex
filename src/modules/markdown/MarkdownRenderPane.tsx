import { type JSX, useEffect, useRef, useState } from "react";
import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";
import {
  pickRenderer,
  RICH_DEBOUNCE_MS,
  shouldDebounce,
} from "@/modules/markdown/lib/renderEngine";
import { MarkdownPreviewPane } from "@/modules/markdown/MarkdownPreviewPane";
import {
  MilkdownEditor,
  type MilkdownEditorHandle,
} from "@/modules/markdown/milkdown/MilkdownEditor";
import { RichMarkdownEditor } from "@/modules/markdown/tiptap/RichMarkdownEditor";

type Props = {
  content: string;
  engine: MarkdownEngine;
  filePath: string;
  workspaceRoot: string | null;
};

function useDebounced(value: string, active: boolean): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setSettled(value), RICH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, active]);
  return active ? settled : value;
}

// TipTap treats `revision` as a cheap reload signal (setContent on the same
// editor instance), so a settled-body counter is fine to bump per debounced
// tick. Milkdown recreates the whole Crepe instance on every revision bump,
// which this pane must never do for a live content update, so it mounts with
// a revision that never changes and instead calls replaceContent(body) via
// MilkdownEditorHandle once the instance has booted.
export function MarkdownRenderPane({
  content,
  engine,
  filePath,
  workspaceRoot,
}: Props): JSX.Element {
  const [failed, setFailed] = useState(false);
  const renderer = pickRenderer(engine, failed);
  const body = useDebounced(content, shouldDebounce(engine));

  const tiptapRevisionRef = useRef(0);
  const previousTiptapBodyRef = useRef(body);
  if (previousTiptapBodyRef.current !== body) {
    previousTiptapBodyRef.current = body;
    tiptapRevisionRef.current += 1;
  }

  const milkdownRef = useRef<MilkdownEditorHandle>(null);
  const [milkdownReady, setMilkdownReady] = useState(false);

  useEffect(() => {
    if (!milkdownReady) return;
    milkdownRef.current?.replaceContent(body);
  }, [body, milkdownReady]);

  if (renderer === "legacy") {
    return <MarkdownPreviewPane content={content} />;
  }
  if (renderer === "milkdown") {
    return (
      <MilkdownEditor
        ref={milkdownRef}
        body={body}
        revision={0}
        editable={false}
        onInitError={() => setFailed(true)}
        onReady={() => setMilkdownReady(true)}
      />
    );
  }
  return (
    <RichMarkdownEditor
      body={body}
      revision={tiptapRevisionRef.current}
      editable={false}
      filePath={filePath}
      workspaceRoot={workspaceRoot}
      wikiLinksEnabled={false}
    />
  );
}
