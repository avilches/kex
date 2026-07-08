// DOM-walking serializer transcribing Helix's save path semantics
// (Editor.svelte:3081-3354 serializeNode/serializeListItem/serializeInline/
// tableToMarkdown, callouts.ts:153-171 serializeCallout). Operates on the
// HTML vocabulary produced by markdownToHtml and by TipTap's getHTML().

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const entries: { text: string; isImage: boolean }[] = [];
  for (const el of Array.from(doc.body.children)) {
    if (el.tagName === "P" && el.childNodes.length === 0) {
      entries.push({ text: "<!-- -->", isImage: false });
      continue;
    }
    entries.push({
      text: serializeBlock(el),
      isImage: isImageOnlyParagraph(el),
    });
  }
  while (entries.length > 0 && entries[entries.length - 1].text === "<!-- -->") {
    entries.pop();
  }
  let result = "";
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) result = entries[i].text;
    else result += (entries[i].isImage ? "" : "\n") + entries[i].text;
  }
  return result.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function textAlignOf(el: Element): string | null {
  const style = el.getAttribute("style") || "";
  const match = style.match(/text-align:\s*([a-z]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function applyLeadingWhitespace(text: string): string {
  return text.replace(/^[\t ]+/, (ws) => "&emsp;".repeat(ws.length));
}

function inlineBlockText(el: Element): string {
  return applyLeadingWhitespace(serializeInline(el));
}

function codeLanguageOf(code: Element): string {
  const dataLang = code.getAttribute("data-language");
  if (dataLang) return dataLang;
  const match = code.className.match(/language-([\w-]+)/);
  return match ? match[1] : "";
}

function isImageOnlyParagraph(el: Element): boolean {
  if (el.tagName === "IMG") return true;
  if (el.tagName !== "P") return false;
  const children = Array.from(el.children);
  if (children.length !== 1 || children[0].tagName !== "IMG") return false;
  return Array.from(el.childNodes).every(
    (n) => n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? "").trim(),
  );
}

function serializeImage(img: Element): string {
  // Raw attribute value, not decoded: an ordinary filename like "assets/100%.png"
  // is not valid percent-encoding and decodeURIComponent throws on it.
  const src = img.getAttribute("src") ?? "";
  if (!src) return "";
  const alt = img.getAttribute("alt") ?? "";
  const size = img.getAttribute("data-size") || "full";
  const sizeSuffix = size !== "full" ? `|size=${size}` : "";
  return `![${alt}${sizeSuffix}](${src})`;
}

function serializeBlock(el: Element): string {
  if (isImageOnlyParagraph(el)) {
    const img = el.tagName === "IMG" ? el : el.querySelector("img");
    const text = img ? serializeImage(img) : "";
    return text ? `${text}\n` : "";
  }

  const align = textAlignOf(el);

  switch (el.tagName) {
    case "P":
      return align && align !== "left"
        ? `<p style="text-align: ${align}">${inlineBlockText(el)}</p>\n`
        : `${inlineBlockText(el)}\n`;
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6": {
      const level = Number(el.tagName[1]);
      return align && align !== "left"
        ? `<h${level} style="text-align: ${align}">${inlineBlockText(el)}</h${level}>\n`
        : `${"#".repeat(level)} ${inlineBlockText(el)}\n`;
    }
    case "PRE": {
      const code = el.querySelector("code");
      if (!code) return el.textContent ?? "";
      const lang = codeLanguageOf(code);
      const text = (code.textContent ?? "").replace(/\n+$/, "");
      return `\`\`\`${lang}\n${text}\n\`\`\`\n`;
    }
    case "BLOCKQUOTE": {
      const blocks = Array.from(el.children).map((child) => {
        const lines = serializeBlock(child).replace(/\n$/, "").split("\n");
        return lines.map((line) => `> ${line}`).join("\n");
      });
      return `${blocks.join("\n>\n")}\n`;
    }
    case "UL":
      return el.getAttribute("data-type") === "taskList"
        ? serializeTaskList(el)
        : serializeBulletList(el);
    case "OL":
      return serializeOrderedList(el);
    case "HR":
      return "---\n";
    case "TABLE":
      return serializeTable(el);
    case "DETAILS": {
      const clone = el.cloneNode(true) as Element;
      for (const btn of Array.from(clone.querySelectorAll("button"))) btn.remove();
      return `${clone.outerHTML}\n`;
    }
    case "DIV":
      return serializeDiv(el);
    default:
      return el.textContent ?? "";
  }
}

function serializeDiv(el: Element): string {
  if (el.hasAttribute("data-callout")) return serializeCallout(el);
  if (el.hasAttribute("data-math-block")) {
    const tex = decodeURIComponent(el.getAttribute("data-math-block") ?? "");
    return `$$\n${tex}\n$$\n`;
  }
  if (
    el.hasAttribute("data-page-break") ||
    /page-break-after/.test(el.getAttribute("style") ?? "")
  ) {
    return '<div style="page-break-after: always;"></div>\n';
  }
  return el.textContent ?? "";
}

function serializeCallout(div: Element): string {
  const type = div.getAttribute("data-callout") || "note";
  const foldable = div.getAttribute("data-callout-foldable") === "true";
  const folded = div.getAttribute("data-callout-folded") === "true";
  const title = (div.getAttribute("data-callout-title") || "").trim();
  const suffix = foldable ? (folded ? "-" : "+") : "";
  const header = `[!${type}]${suffix}${title ? ` ${title}` : ""}`;

  const parts: string[] = [];
  for (const child of Array.from(div.children)) {
    if (child.classList.contains("callout-header")) continue;
    parts.push(serializeBlock(child).replace(/\n+$/, ""));
  }
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();

  const out = [`> ${header}`];
  const inner = parts.join("\n\n");
  if (inner.length > 0) {
    for (const line of inner.split("\n")) out.push(line.length > 0 ? `> ${line}` : ">");
  }
  return `${out.join("\n")}\n`;
}

function serializeBulletList(el: Element): string {
  const items = Array.from(el.children)
    .filter((li) => li.tagName === "LI")
    .map((li) => `- ${serializeListItem(li)}`);
  return `${items.join("")}\n`;
}

function serializeOrderedList(el: Element): string {
  const start = Number(el.getAttribute("start") || "1") || 1;
  const items = Array.from(el.children)
    .filter((li) => li.tagName === "LI")
    .map((li, i) => `${start + i}. ${serializeListItem(li)}`);
  return `${items.join("")}\n`;
}

function serializeTaskList(el: Element): string {
  const items = Array.from(el.children)
    .filter((li) => li.tagName === "LI")
    .map((li) => {
      const checked = li.getAttribute("data-checked") === "true" ? "x" : " ";
      return `- [${checked}] ${serializeListItem(li)}`;
    });
  return `${items.join("")}\n`;
}

// TipTap's taskItem renders `<label><input.../></label><div><p>...</p></div>`;
// the checkbox lives in the label, the real item body in the sibling div.
function listItemContentNodes(li: Element): Node[] {
  const label = Array.from(li.children).find((c) => c.tagName === "LABEL");
  if (label) {
    const div = label.nextElementSibling;
    if (div) return Array.from(div.childNodes);
  }
  return Array.from(li.childNodes);
}

function serializeListItem(li: Element): string {
  const nodes = listItemContentNodes(li);
  const parts: string[] = [];
  let buffer: Node[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const raw = buffer.map((n) => serializeInline(n)).join("");
    buffer = [];
    const withLeading = applyLeadingWhitespace(raw);
    // Each real `<br>` element serializes to a "  \n" marker (see
    // serializeInline). A single trailing marker survives: keep the two
    // marker spaces, drop only the trailing "\n" since parts.join("\n")
    // below re-adds exactly one newline between parts. Two or more in a row
    // do NOT survive as repeated "  \n" markers - CommonMark treats a
    // whitespace-only line as a blank line that ends the paragraph, so
    // markdown-it collapses "text  \n  \n" back down to a single "text" on
    // reparse instead of stacking hard breaks (verified against markdown-it
    // directly: it renders that input as two separate paragraphs, not one
    // paragraph with two <br>s). Represent 2+ consecutive trailing breaks as
    // literal `<br>` HTML instead: markdown-it is configured with
    // `html: true`, so raw inline HTML round-trips through it verbatim and
    // every subsequent pass regenerates the exact same DOM, giving true
    // idempotence instead of just surviving one extra pass. Any other
    // trailing whitespace (no leading two spaces) is markdown-it's bare
    // newline pretty-printing artifact (e.g. the text node it inserts
    // between a list item's inline content and a following nested list) and
    // must be dropped entirely.
    const trailingBreaks = withLeading.match(/(?: {2}\n)+$/);
    let text: string;
    if (trailingBreaks) {
      const breakCount = trailingBreaks[0].length / 3;
      const base = withLeading.slice(0, withLeading.length - trailingBreaks[0].length);
      text = breakCount === 1 ? `${base}  ` : `${base}${"<br>".repeat(breakCount)}`;
    } else {
      text = withLeading.replace(/\s+$/, "");
    }
    if (text.length > 0) parts.push(text);
  };
  for (const node of nodes) {
    if (node instanceof Element && node.tagName === "P") {
      flush();
      parts.push(inlineBlockText(node));
    } else if (node instanceof Element && (node.tagName === "UL" || node.tagName === "OL")) {
      flush();
      const nested = serializeBlock(node).replace(/\n$/, "");
      const indented = nested
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      // No own text (paragraph or inline run) precedes this nested list: the
      // item's bullet marker has nothing to attach to on its own line, so
      // give it an empty first part rather than gluing the marker straight
      // onto the nested list's indentation.
      if (parts.length === 0) parts.push("");
      parts.push(indented);
    } else {
      buffer.push(node);
    }
  }
  flush();
  return `${parts.join("\n")}\n`;
}

function cellHasStyling(cell: Element): boolean {
  if (cell.hasAttribute("data-bg-color")) return true;
  const colspan = Number(cell.getAttribute("colspan") || "1");
  const rowspan = Number(cell.getAttribute("rowspan") || "1");
  return colspan > 1 || rowspan > 1;
}

function serializeTableCell(cell: Element): string {
  const paragraphs = Array.from(cell.children).filter((c) => c.tagName === "P");
  const text =
    paragraphs.length > 0
      ? paragraphs.map((p) => inlineBlockText(p)).join(" ")
      : inlineBlockText(cell);
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// Only called once serializeTable has confirmed row 0 carries `th` cells, so
// the separator always belongs directly under row 0 (GFM requires exactly
// that shape).
function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const rowCells = rows.map((row) =>
    Array.from(row.children)
      .filter((c) => c.tagName === "TH" || c.tagName === "TD")
      .map((cell) => serializeTableCell(cell)),
  );
  const colCount = Math.max(...rowCells.map((r) => r.length));
  const lines: string[] = [];
  rowCells.forEach((row, i) => {
    lines.push(`| ${row.join(" | ")} |`);
    if (i === 0) lines.push(`| ${Array(colCount).fill("---").join(" | ")} |`);
  });
  return lines.join("\n");
}

function serializeTable(el: Element): string {
  const cells = Array.from(el.querySelectorAll("td, th"));
  if (cells.some(cellHasStyling)) return `${el.outerHTML}\n`;
  const rows = Array.from(el.querySelectorAll("tr"));
  if (rows.length > 0) {
    const row0HasHeader = Array.from(rows[0].children).some((c) => c.tagName === "TH");
    // GFM pipe tables require a header row directly above the `---`
    // separator. A table with no `th` cells in row 0 - either a genuinely
    // headerless table, or one whose header row isn't first - can't be
    // represented as a clean pipe table without inventing structure that
    // wasn't there (emitting a separator with no real header, or silently
    // treating a data row as the header). Fall back to raw HTML, same as
    // the styled-cell case above.
    if (!row0HasHeader) return `${el.outerHTML}\n`;
  }
  return `${tableToMarkdown(el)}\n`;
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // markdown-it always renders hardbreak as "<br>\n" - the trailing newline
    // is HTML pretty-printing, not content; drop it so hard breaks round-trip.
    const text = node.textContent ?? "";
    return node.previousSibling instanceof Element && node.previousSibling.tagName === "BR"
      ? text.replace(/^\n/, "")
      : text;
  }
  if (!(node instanceof Element)) return "";
  const inner = () => Array.from(node.childNodes).map(serializeInline).join("");
  switch (node.tagName) {
    case "STRONG":
    case "B":
      return `**${inner()}**`;
    case "EM":
    case "I":
      return `*${inner()}*`;
    case "S":
    case "DEL":
      return `~~${inner()}~~`;
    case "CODE":
      return `\`${inner()}\``;
    case "U":
      return `<u>${inner()}</u>`;
    case "SUB":
      return `~${inner()}~`;
    case "SUP":
      return `^${inner()}^`;
    case "MARK": {
      const color = node.getAttribute("data-color");
      return color ? `<mark data-color="${color}">${inner()}</mark>` : `==${inner()}==`;
    }
    case "SPAN": {
      if (node.hasAttribute("data-math-inline"))
        return `$${decodeURIComponent(node.getAttribute("data-math-inline") ?? "")}$`;
      if (node.hasAttribute("data-wiki-link")) {
        const title = node.getAttribute("data-title") || inner();
        const text = inner();
        return title !== text ? `[[${title}|${text}]]` : `[[${title}]]`;
      }
      const color = (node as HTMLElement).style?.color;
      return color ? `<span style="color: ${color}">${inner()}</span>` : inner();
    }
    case "A":
      // Raw attribute value, not decoded: an ordinary URL like
      // "https://en.wikipedia.org/wiki/100%_(album)" is not valid
      // percent-encoding and decodeURIComponent throws on it.
      return `[${inner()}](${node.getAttribute("href") ?? ""})`;
    case "IMG":
      return serializeImage(node);
    case "BR":
      return "  \n";
    default:
      return inner();
  }
}
