import { convertFileSrc } from "@tauri-apps/api/core";
import type { Editor, Extensions } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Color } from "@tiptap/extension-color";
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import { StarterKit } from "@tiptap/starter-kit";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { toast } from "sonner";
import { htmlToMarkdown } from "@/modules/markdown/lib/htmlToMarkdown";
import { markdownToHtml } from "@/modules/markdown/lib/markdownToHtml";
import {
  buildWikiLinkIndex,
  type WikiLinkContext,
  type WikiLinkEntry,
} from "@/modules/markdown/lib/wikiLinks";
import { CodeLangDropdown } from "@/modules/markdown/rich/CodeLangDropdown";
import {
  Callout,
  CalloutTyping,
  insertCallout,
} from "@/modules/markdown/rich/extensions/callout";
import {
  type CodeLangDropdownState,
  CopyButtonExtension,
  createCodeBlockLanguageSelect,
  getLowlight,
} from "@/modules/markdown/rich/extensions/codeBlock";
import { CtrlEndScrollPastEnd } from "@/modules/markdown/rich/extensions/ctrlEndScrollPastEnd";
import {
  CollapsibleKeymap,
  DetailsOpenAttrSync,
  insertDetails,
} from "@/modules/markdown/rich/extensions/details";
import { HeadingShortcuts } from "@/modules/markdown/rich/extensions/headingShortcuts";
import { RichImage } from "@/modules/markdown/rich/extensions/image";
import {
  createMathBlock,
  createMathInline,
  type MathEditRequest,
} from "@/modules/markdown/rich/extensions/math";
import { createMermaidRenderer } from "@/modules/markdown/rich/extensions/mermaid";
import { MoveLineShortcuts } from "@/modules/markdown/rich/extensions/moveLineShortcuts";
import { NoteSearchExtension } from "@/modules/markdown/rich/extensions/noteSearch";
import { PageBreak } from "@/modules/markdown/rich/extensions/pageBreak";
import {
  createSlashMenu,
  type SlashMenuController,
} from "@/modules/markdown/rich/extensions/slashCommands";
import { ColorSwatch } from "@/modules/markdown/rich/extensions/colorSwatch";
import {
  RichTableCell,
  RichTableHeader,
} from "@/modules/markdown/rich/extensions/table";
import { TabIndent } from "@/modules/markdown/rich/extensions/tabIndent";
import {
  createWikiLink,
  createWikiLinkAutocomplete,
  type WikiLinkController,
} from "@/modules/markdown/rich/extensions/wikiLink";
import { WrapSelectedText } from "@/modules/markdown/rich/extensions/wrapSelectedText";
import {
  createMenuStore,
  type MenuStore,
} from "@/modules/markdown/rich/lib/menuStore";
import { FindBar } from "@/modules/markdown/rich/FindBar";
import { MathModal } from "@/modules/markdown/rich/MathModal";
import { SlashMenu } from "@/modules/markdown/rich/SlashMenu";
import { WikiLinkMenu } from "@/modules/markdown/rich/WikiLinkMenu";
import "@/modules/markdown/rich/richMarkdown.css";

const SERIALIZE_DEBOUNCE_MS = 300;

export type RichMarkdownEditorHandle = {
  serialize(): string;
  focus(): void;
  openMathInsert(kind: "block" | "inline"): void;
};

export type RichMarkdownEditorProps = {
  body: string;
  revision: number;
  filePath: string;
  workspaceRoot: string | null;
  wikiLinksEnabled: boolean;
  tick: MenuStore<number>;
  onEditorChange: (editor: Editor | null) => void;
  onChangeMarkdown: (md: string) => void;
  onNavigateFile: (path: string) => void;
  findOpen: boolean;
  onCloseFind: () => void;
};

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(p);
}

export const RichMarkdownEditor = forwardRef<
  RichMarkdownEditorHandle,
  RichMarkdownEditorProps
>(function RichMarkdownEditor(props, ref) {
  // Per-instance controllers/stores. Stable for the component's lifetime.
  const codeLangStore = useMemo<MenuStore<CodeLangDropdownState>>(
    () => createMenuStore<CodeLangDropdownState>(null),
    [],
  );
  const mathEdit = useMemo<MenuStore<MathEditRequest>>(
    () => createMenuStore<MathEditRequest>(null),
    [],
  );

  const editorRef = useRef<Editor | null>(null);

  const slash = useMemo<SlashMenuController>(
    () =>
      createSlashMenu({
        openMathInsert: (kind) => mathEdit.set({ pos: -1, kind, tex: "" }),
        insertCallout: (type) => {
          if (editorRef.current) insertCallout(editorRef.current, type);
        },
        insertDetails: () => {
          if (editorRef.current) insertDetails(editorRef.current);
        },
      }),
    [mathEdit],
  );

  // Latest prop callbacks/values behind refs so the memoized controllers and the
  // once-created editor never capture stale closures.
  const onEditorChangeRef = useRef(props.onEditorChange);
  onEditorChangeRef.current = props.onEditorChange;
  const onChangeMarkdownRef = useRef(props.onChangeMarkdown);
  onChangeMarkdownRef.current = props.onChangeMarkdown;
  const onNavigateRef = useRef(props.onNavigateFile);
  onNavigateRef.current = props.onNavigateFile;
  const tickRef = useRef(props.tick);
  tickRef.current = props.tick;
  const workspaceRootRef = useRef(props.workspaceRoot);
  workspaceRootRef.current = props.workspaceRoot;
  const filePathRef = useRef(props.filePath);
  filePathRef.current = props.filePath;

  const wikiEntriesRef = useRef<WikiLinkEntry[]>([]);
  const getWikiContext = useCallback(
    (): WikiLinkContext => ({
      entries: wikiEntriesRef.current,
      root: workspaceRootRef.current ?? "",
    }),
    [],
  );

  const wiki = useMemo<WikiLinkController | null>(
    () =>
      props.wikiLinksEnabled
        ? createWikiLinkAutocomplete({ getContext: getWikiContext })
        : null,
    [props.wikiLinksEnabled, getWikiContext],
  );

  // Load the wiki-link index for autocomplete + markdown resolution.
  useEffect(() => {
    if (!props.wikiLinksEnabled || !props.workspaceRoot) return;
    let cancelled = false;
    buildWikiLinkIndex(props.workspaceRoot)
      .then((entries) => {
        if (cancelled) return;
        wikiEntriesRef.current = entries;
        wiki?.entries.set(entries);
      })
      .catch((e) => console.error("Failed to load wiki-link index:", e));
    return () => {
      cancelled = true;
    };
  }, [props.wikiLinksEnabled, props.workspaceRoot, wiki]);

  const resolveImageSrc = useCallback((src: string): string => {
    if (/^(https?:|data:)/i.test(src)) return src;
    if (isAbsolutePath(src)) return convertFileSrc(src);
    const dir = filePathRef.current.split(/[\\/]/).slice(0, -1).join("/");
    return convertFileSrc(dir ? `${dir}/${src}` : src);
  }, []);

  // Parse only on load / external reload, never per keystroke.
  const html = useMemo(() => {
    const wikiCtx = props.wikiLinksEnabled
      ? { entries: wikiEntriesRef.current, root: props.workspaceRoot ?? "" }
      : undefined;
    return markdownToHtml(props.body, { wikiLinks: wikiCtx, resolveImageSrc });
    // biome-ignore lint/correctness/useExhaustiveDependencies: body is re-parsed only when revision bumps
  }, [props.revision]);

  const isDark = useCallback(
    () => document.documentElement.classList.contains("dark"),
    [],
  );

  const extensions = useMemo<Extensions>(() => {
    const list: Extensions = [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node }) => {
          if (node.type.name === "detailsSummary") return "Section title...";
          if (node.type.name === "detailsContent") return "Content...";
          return "Start writing...";
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      RichTableCell,
      RichTableHeader,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "editor-link" },
        isAllowedUri: (url, ctx) =>
          ctx.defaultValidate(url) || !url.startsWith("javascript:"),
        shouldAutoLink: (url) => /^https?:\/\//.test(url),
      }),
      RichImage.configure({ inline: true, HTMLAttributes: { class: "editor-image" } }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Underline,
      Subscript,
      Superscript,
      TextStyle,
      Color,
      CodeBlockLowlight.configure({
        lowlight: getLowlight(),
        enableTabIndentation: true,
        defaultLanguage: "text",
      }),
      createCodeBlockLanguageSelect(codeLangStore),
      CopyButtonExtension,
      createMermaidRenderer(isDark),
      createMathBlock(mathEdit),
      createMathInline(mathEdit),
      PageBreak,
      Callout,
      CalloutTyping,
      Details.configure({ persist: true, HTMLAttributes: { class: "editor-details" } }),
      DetailsSummary,
      DetailsContent,
      CollapsibleKeymap,
      DetailsOpenAttrSync,
      TextAlign.configure({ types: ["heading", "paragraph"] }).extend({
        addKeyboardShortcuts: () => ({}),
      }),
      CtrlEndScrollPastEnd,
      HeadingShortcuts,
      WrapSelectedText,
      slash.extension,
      MoveLineShortcuts,
      TabIndent,
      NoteSearchExtension,
      ColorSwatch,
    ];
    if (props.wikiLinksEnabled && wiki) {
      list.push(
        createWikiLink((path) => onNavigateRef.current(path)),
        wiki.extension,
      );
    }
    return list;
  }, [codeLangStore, mathEdit, slash, wiki, isDark, props.wikiLinksEnabled]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextUpdate = useRef(false);
  const rafRef = useRef(0);

  const editor = useEditor({
    extensions,
    content: html,
    editorProps: {
      attributes: { class: "editor-content", spellcheck: "false" },
      handleDOMEvents: {
        // Prevent focus-caused scroll jumps when clicking details toggles and task
        // checkboxes: pre-focus without scroll, then lock the scroll position for a
        // short window covering sync + rAF + timeout scrolls the toggle may trigger.
        mousedown: (view, event) => {
          const target = event.target as HTMLElement;
          if (target.closest('[data-type="details"] > button')) {
            event.preventDefault();
            if (!view.hasFocus()) {
              (view.dom as HTMLElement).focus({ preventScroll: true });
            }
          }
          if (target.closest("li[data-checked] > label")) {
            const body = target.closest(".rich-md-body") as HTMLElement | null;
            if (body) {
              const saved = body.scrollTop;
              const restore = () => {
                body.scrollTop = saved;
              };
              body.addEventListener("scroll", restore);
              setTimeout(() => body.removeEventListener("scroll", restore), 200);
            }
          }
        },
        // Prevent native text drag - it copies instead of moves in Tauri's webview.
        dragstart: (_view, event) => {
          const dt = event.dataTransfer;
          if (!dt || dt.files.length === 0) event.preventDefault();
        },
      },
      handlePaste: (_view, event) => {
        if ((event.clipboardData?.files.length ?? 0) > 0) {
          toast("Image paste is not supported yet");
          return true;
        }
        return false;
      },
      // Strip color / font styling from pasted HTML so the editor keeps its own
      // theme. Semantic marks (bold, italic, links, headings, alignment) survive.
      transformPastedHTML: (pasted: string) => {
        if (!/style=|<font/i.test(pasted)) return pasted;
        try {
          const doc = new DOMParser().parseFromString(pasted, "text/html");
          for (const el of doc.querySelectorAll("[style]")) {
            const style = (el as HTMLElement).style;
            style.color = "";
            style.backgroundColor = "";
            style.fontFamily = "";
            style.fontSize = "";
            if (!style.cssText.trim()) el.removeAttribute("style");
          }
          for (const el of doc.querySelectorAll("font")) {
            el.removeAttribute("color");
            el.removeAttribute("face");
            el.removeAttribute("size");
          }
          return doc.body.innerHTML;
        } catch (e) {
          console.warn("[paste] style strip failed", e);
          return pasted;
        }
      },
    },
    onUpdate: ({ editor }) => {
      if (ignoreNextUpdate.current) {
        ignoreNextUpdate.current = false;
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onChangeMarkdownRef.current(htmlToMarkdown(editor.getHTML()));
      }, SERIALIZE_DEBOUNCE_MS);
    },
    onTransaction: ({ editor }) => {
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          tickRef.current.set(tickRef.current.get() + 1);
        });
      }
      slash.onTransaction(editor);
      wiki?.onTransaction(editor);
    },
  });

  editorRef.current = editor;

  // Publish the live instance up to MarkdownTab (Toolbar / OutlinePanel).
  useEffect(() => {
    onEditorChangeRef.current(editor);
    return () => onEditorChangeRef.current(null);
  }, [editor]);

  // External reload: replace content without dirtying. onUpdate swallows the
  // synchronous update the setContent emits via ignoreNextUpdate.
  const firstRevisionRef = useRef(true);
  useEffect(() => {
    if (!editor) return;
    if (firstRevisionRef.current) {
      firstRevisionRef.current = false;
      return;
    }
    ignoreNextUpdate.current = true;
    editor.commands.setContent(html);
  }, [editor, html]);

  // Flush a pending serialize on unmount so the last edit is never lost.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        const ed = editorRef.current;
        if (ed) onChangeMarkdownRef.current(htmlToMarkdown(ed.getHTML()));
      }
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      serialize: () => {
        const ed = editorRef.current;
        if (!ed) return "";
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        return htmlToMarkdown(ed.getHTML());
      },
      focus: () => {
        editorRef.current?.commands.focus();
      },
      openMathInsert: (kind) => {
        mathEdit.set({ pos: -1, kind, tex: "" });
      },
    }),
    [mathEdit],
  );

  const handleSelectLang = useCallback(
    (lang: string) => {
      const ed = editorRef.current;
      const st = codeLangStore.get();
      if (!ed || !st) return;
      const resolved = ed.state.doc.resolve(st.pos);
      const node = resolved.parent;
      if (node.type.name !== "codeBlock") return;
      const nodePos = resolved.before(resolved.depth);
      ed.view.dispatch(
        ed.state.tr.setNodeMarkup(nodePos, undefined, {
          ...node.attrs,
          language: lang || null,
        }),
      );
      ed.commands.focus();
    },
    [codeLangStore],
  );

  const handleMathCommit = useCallback(
    (req: { pos: number; kind: "block" | "inline"; tex: string }) => {
      const ed = editorRef.current;
      if (!ed) return;
      const tex = req.tex.trim();
      if (!tex) return;
      if (req.pos < 0) {
        const type = req.kind === "block" ? "mathBlock" : "mathInline";
        ed.chain().focus().insertContent({ type, attrs: { tex } }).run();
        return;
      }
      const node = ed.state.doc.nodeAt(req.pos);
      if (node && (node.type.name === "mathBlock" || node.type.name === "mathInline")) {
        ed.view.dispatch(ed.state.tr.setNodeAttribute(req.pos, "tex", tex));
      }
    },
    [],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="rich-md-body thin-scrollbar min-h-0 flex-1">
        <EditorContent editor={editor} />
      </div>
      {editor && <SlashMenu controller={slash} editor={editor} />}
      {editor && props.wikiLinksEnabled && wiki && (
        <WikiLinkMenu
          controller={wiki}
          editor={editor}
          root={props.workspaceRoot ?? ""}
        />
      )}
      <CodeLangDropdown store={codeLangStore} onSelect={handleSelectLang} />
      <MathModal request={mathEdit} onCommit={handleMathCommit} />
      <FindBar editor={editor} open={props.findOpen} onClose={props.onCloseFind} />
    </div>
  );
});
