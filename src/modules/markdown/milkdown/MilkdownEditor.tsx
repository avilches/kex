import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import { headingIdGenerator } from "@milkdown/kit/preset/commonmark";
import { replaceAll } from "@milkdown/kit/utils";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  headingsFromMarkdown,
  slugifyHeadingText,
  type OutlineHeading,
} from "@/modules/markdown/milkdown/outline";
import "@/modules/markdown/milkdown/milkdownTheme.css";

export type MilkdownEditorHandle = {
  serialize: () => string | null;
  scrollToHeading: (id: string) => void;
  // Replaces the live document in place, without tearing down and recreating
  // Crepe. A no-op before the instance has finished booting (see onReady).
  replaceContent: (md: string) => void;
};

type Props = {
  body: string;
  revision: number;
  editable?: boolean;
  onChangeMarkdown?: (md: string) => void;
  onHeadingsChange?: (headings: OutlineHeading[]) => void;
  onInitError?: (message: string) => void;
  onReady?: () => void;
};

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, Props>(
  function MilkdownEditor(
    {
      body,
      revision,
      editable = true,
      onChangeMarkdown,
      onHeadingsChange,
      onInitError,
      onReady,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const bodyRef = useRef(body);
    bodyRef.current = body;
    const onChangeRef = useRef(onChangeMarkdown);
    onChangeRef.current = onChangeMarkdown;
    const onHeadingsRef = useRef(onHeadingsChange);
    onHeadingsRef.current = onHeadingsChange;
    const onInitErrorRef = useRef(onInitError);
    onInitErrorRef.current = onInitError;
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

    useImperativeHandle(ref, () => ({
      serialize: () => crepeRef.current?.getMarkdown() ?? null,
      scrollToHeading: (id: string) => {
        const el = rootRef.current?.querySelector(`[id="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      replaceContent: (md: string) => {
        crepeRef.current?.editor.action(replaceAll(md, true));
      },
    }));

    // biome-ignore lint/correctness/useExhaustiveDependencies: body is read through bodyRef on purpose, revision is the reload signal
    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      let disposed = false;
      let instance: Crepe | null = null;

      const boot = async () => {
        const crepe = new Crepe({
          root: el,
          defaultValue: bodyRef.current,
          features: { [Crepe.Feature.TopBar]: true },
        });
        // Milkdown's default heading-id generator keeps punctuation, so it
        // never agrees with headingsFromMarkdown's slugs; scrollToHeading
        // would silently miss. Force both sides to the same base slug.
        crepe.editor.config((ctx) => {
          ctx.set(headingIdGenerator.key, (node) => slugifyHeadingText(node.textContent));
        });
        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, md) => {
            if (disposed) return;
            onChangeRef.current?.(md);
            onHeadingsRef.current?.(headingsFromMarkdown(md));
          });
        });
        await crepe.create();
        if (disposed) {
          void crepe.destroy();
          return;
        }
        crepe.setReadonly(!editable);
        instance = crepe;
        crepeRef.current = crepe;
        onHeadingsRef.current?.(headingsFromMarkdown(bodyRef.current));
        onReadyRef.current?.();
      };

      boot().catch((e) => {
        if (disposed) return;
        console.error("[milkdown] editor init failed", e);
        onInitErrorRef.current?.(e instanceof Error ? e.message : String(e));
      });

      return () => {
        disposed = true;
        crepeRef.current = null;
        if (instance) void instance.destroy();
        el.replaceChildren();
      };
    }, [revision, editable]);

    return <div ref={rootRef} className="milkdown-editor h-full min-h-0 overflow-y-auto" />;
  },
);
