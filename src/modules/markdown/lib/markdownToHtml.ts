import MarkdownIt from "markdown-it";
import markdownItMark from "markdown-it-mark";
import markdownItSub from "markdown-it-sub";
import markdownItSup from "markdown-it-sup";
import { transformCalloutBlockquotes } from "@/modules/markdown/lib/callouts";
import { resolveWikiRef, type WikiLinkContext } from "@/modules/markdown/lib/wikiLinks";

export type MarkdownToHtmlOptions = {
  wikiLinks?: WikiLinkContext;
  resolveImageSrc?: (src: string) => string;
};

// Module-level singleton, mirrors Editor.svelte:532-537 exactly.
const mdit = MarkdownIt({ html: true, linkify: false, breaks: false })
  .use(markdownItMark)
  .use(markdownItSup)
  .use(markdownItSub);
// Disable indented code blocks - tab-indented text should stay as text, not become code
mdit.disable("code");

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToHtml(md: string, opts: MarkdownToHtmlOptions = {}): string {
  let src = md;

  // Pre-process: convert [[Note Title]] wiki-links to HTML anchors
  // Supports Obsidian syntax: [[note|alias]], [[note#heading]], [[note^block]]
  if (opts.wikiLinks) {
    const wikiLinks = opts.wikiLinks;
    src = src.replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
      // Split on pipe: [[note|display text]] -> noteRef="note", display="display text"
      const pipeIdx = raw.indexOf("|");
      const noteRef = (pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw).trim();
      const display = (pipeIdx >= 0 ? raw.slice(pipeIdx + 1) : noteRef).trim();
      const match = resolveWikiRef(noteRef, wikiLinks);
      const path = match ? match.path : "";
      return `<span data-wiki-link data-path="${escapeHtml(path)}" data-title="${escapeHtml(noteRef)}" class="wiki-link">${escapeHtml(display)}</span>`;
    });
  }

  // Pre-process: normalize link/image destinations for strict-CommonMark markdown-it.
  // Handles angle-bracket destinations <url>, optional titles ("..."/'...'/(...)), and the
  // non-standard %20 separator some exporters (e.g. Notesnook) emit between url and title.
  // Emits clean [label](encoded-url); titles are dropped (we never serialize them anyway).
  src = src.replace(
    /(!?)(\[[^\]]*\])\(<([^>]*)>(?:(?:\s|%20)*(?:"[^"]*"|'[^']*'|\([^)]*\)))?(?:\s|%20)*\)/g,
    (_m, bang, label, url) => `${bang}${label}(${url.replace(/ /g, "%20")})`,
  );
  // Bare destination with a trailing quoted title: [label](url "title") -> drop title, encode spaces.
  // Stops our own space-encoder below from mangling valid CommonMark titled links.
  src = src.replace(
    /(!?)(\[[^\]]*\])\(([^()<>]*?)(?:\s|%20)+(?:"[^"]*"|'[^']*')(?:\s|%20)*\)/g,
    (_m, bang, label, url) => `${bang}${label}(${url.replace(/ /g, "%20")})`,
  );

  // Pre-process: percent-encode spaces in image URLs so markdown-it parses them correctly
  src = src.replace(/!\[([^\]]*)\]\(([^)]*\s[^)]*)\)/g, (_match, alt, url) => {
    return `![${alt}](${url.replace(/ /g, "%20")})`;
  });

  // Pre-process: percent-encode spaces in link URLs so markdown-it parses them correctly
  // Matches [text](url with spaces) but not ![image](url) (already handled above)
  src = src.replace(/(?<!!)\[([^\]]*)\]\(([^)]*\s[^)]*)\)/g, (_match, text, url) => {
    return `[${text}](${url.replace(/ /g, "%20")})`;
  });

  // Pre-process: render KaTeX math - only outside fenced code blocks
  {
    const lines = src.split("\n");
    const outLines: string[] = [];
    let inFence = false;
    let mathBlock: string[] | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line)) {
        inFence = !inFence;
        outLines.push(line);
        continue;
      }
      if (inFence) {
        outLines.push(line);
        continue;
      }
      // Accumulate block math: $$ on its own line starts/ends a block
      if (line.trim() === "$$") {
        if (!mathBlock) {
          mathBlock = [];
          continue;
        }
        const tex = mathBlock.join("\n").trim();
        mathBlock = null;
        outLines.push(`<div data-math-block="${encodeURIComponent(tex)}" class="math-block"></div>`);
        continue;
      }
      if (mathBlock) {
        mathBlock.push(line);
        continue;
      }
      // Inline math: $...$ (skip content inside backticks)
      const processed = line.replace(/`[^`]*`/g, (m) => "\x00".repeat(m.length));
      let result = line;
      let offset = 0;
      for (const m of processed.matchAll(/(?<!\$)\$(?![\s$])([^\n$]+?)(?<!\s)\$(?!\$)(?!\d)/g)) {
        const tex = m[1].trim();
        const html = `<span data-math-inline="${encodeURIComponent(tex)}" class="math-inline"></span>`;
        result = result.slice(0, m.index! + offset) + html + result.slice(m.index! + m[0].length + offset);
        offset += html.length - m[0].length;
      }
      outLines.push(result);
    }
    // If unclosed math block, just output the lines as-is
    if (mathBlock) {
      outLines.push("$$", ...mathBlock);
    }
    src = outLines.join("\n");
  }

  // Pre-process: convert task list syntax before markdown-it (it doesn't know TipTap's format)
  // Support indented (nested) and blockquoted task lists too
  src = src.replace(/^([\s>]*)-\s\[x\][^\S\n]+(.+)$/gm, '$1- <tiptask checked="true">$2</tiptask>');
  src = src.replace(/^([\s>]*)-\s\[x\][^\S\n]*$/gm, '$1- <tiptask checked="true">&nbsp;</tiptask>');
  src = src.replace(/^([\s>]*)-\s\[ \][^\S\n]+(.+)$/gm, '$1- <tiptask checked="false">$2</tiptask>');
  src = src.replace(/^([\s>]*)-\s\[ \][^\S\n]*$/gm, '$1- <tiptask checked="false">&nbsp;</tiptask>');

  // Pre-process: replace empty-paragraph markers with a div sentinel before markdown-it.
  // A bare <!-- --> starts an HTML block that swallows the next line; the blank lines
  // around the div keep it isolated. Post-render converts it back to <p></p>.
  src = src.replace(/<!-- -->/g, "\n\n<div data-empty-para></div>\n\n");

  // Pre-process: preserve blank lines before image-only lines
  // markdown-it collapses blank lines into paragraph breaks, losing the empty paragraph.
  // Insert a <div> marker that markdown-it passes through (html: true), then convert to <p></p>
  src = src.replace(/\n\n(!\[[^\]]*\]\([^)]*\)\s*$)/gm, "\n\n<div data-img-gap></div>\n\n$1");

  // Run markdown-it (single-pass parser - handles headings, bold, italic, strike, code, blockquote, lists, links, images, hr, tables, raw HTML)
  let html = mdit.render(src);

  // Post-process: convert image gap markers into empty paragraphs for ProseMirror
  html = html.replace(/<div data-img-gap><\/div>\n?/g, "<p></p>\n");

  // Post-process: strip trailing newlines inside code blocks (markdown-it adds them, TipTap shows them as blank lines)
  html = html.replace(/<code([^>]*)>\n?/g, "<code$1>");
  html = html.replace(/\n<\/code>/g, "</code>");

  // Post-process: convert empty-paragraph div sentinels back to empty paragraphs for TipTap
  html = html.replace(/<div data-empty-para><\/div>\n?/g, "<p></p>\n");

  // Post-process: convert task list items to TipTap format
  // Convert opening <li> + <tiptask> into data-attributed <li>, handles both tight and loose (with <p>) lists
  html = html.replace(
    /<li>(\s*(?:<p>)?)\s*<tiptask checked="(true|false)">([\s\S]*?)<\/tiptask>\s*(?:<\/p>)?/gi,
    (_, _pre, checked, text) => {
      return `<li data-type="taskItem" data-checked="${checked}">${text}`;
    },
  );
  html = html.replace(/<ul>(\s*<li data-type="taskItem")/gi, '<ul data-type="taskList">$1');

  // Post-process: resolve image src paths and parse size attribute
  const resolveImageSrc = opts.resolveImageSrc ?? ((s: string) => s);
  html = html.replace(/<img\s+src="([^"]*)"(?:\s+alt="([^"]*)")?[^>]*\/?>/gi, (_, imgSrc, altRaw) => {
    let alt = altRaw || "";
    let size = "full";
    const sizeMatch = alt.match(/^(.*?)\|size=(small|medium|full)$/);
    if (sizeMatch) {
      alt = sizeMatch[1];
      size = sizeMatch[2];
    }
    return `<img src="${resolveImageSrc(imgSrc)}" alt="${alt}" data-size="${size}">`;
  });

  // Post-process: turn Obsidian callout blockquotes (> [!type] ...) into callout blocks.
  if (html.includes("[!")) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    transformCalloutBlockquotes(tmp);
    html = tmp.innerHTML;
  }

  return html;
}
