import { type TextEntry, type TextKind, entryKey } from "./entries";

export type Overrides = Map<string, string>;
export type Editable = { kind: TextKind; original: string; current: string };

type Applied = { original: string; applied: string };
type AttrKind = Exclude<TextKind, "text">;

const ATTR_KINDS: AttrKind[] = ["title", "placeholder"];
const SKIP = "script, style, [data-settings-text-editor]";

const textState = new WeakMap<Text, Applied>();
const attrState = new WeakMap<Element, Partial<Record<AttrKind, Applied>>>();

let overrides: Overrides = new Map();

export function toOverrides(entries: TextEntry[]): Overrides {
  return new Map(entries.map((e) => [entryKey(e.kind, e.original), e.edited]));
}

const leading = (s: string) => s.slice(0, s.length - s.trimStart().length);
const trailing = (s: string) => s.slice(s.trimEnd().length);

// A node React rewrote since we edited it no longer holds what we applied, so
// whatever it holds now is a fresh original.
function liveTextState(node: Text): Applied | undefined {
  const tracked = textState.get(node);
  if (tracked && tracked.applied !== node.nodeValue) {
    textState.delete(node);
    return undefined;
  }
  return tracked;
}

function liveAttrState(el: Element, attr: AttrKind): Applied | undefined {
  const tracked = attrState.get(el)?.[attr];
  if (tracked && tracked.applied !== el.getAttribute(attr)) {
    delete attrState.get(el)?.[attr];
    return undefined;
  }
  return tracked;
}

function reconcileText(node: Text) {
  if (node.parentElement?.closest(SKIP)) return;
  const value = node.nodeValue ?? "";
  const tracked = liveTextState(node);
  const original = tracked ? tracked.original : value.trim();
  if (!original) return;
  const edited = overrides.get(entryKey("text", original));
  if (edited === undefined) {
    if (!tracked) return;
    node.nodeValue = leading(value) + original + trailing(value);
    textState.delete(node);
    return;
  }
  const next = leading(value) + edited + trailing(value);
  if (next === value) return;
  node.nodeValue = next;
  textState.set(node, { original, applied: next });
}

function reconcileAttr(el: Element, attr: AttrKind) {
  if (el.closest(SKIP)) return;
  const value = el.getAttribute(attr);
  if (value === null) return;
  const tracked = liveAttrState(el, attr);
  const original = tracked ? tracked.original : value;
  if (!original) return;
  const edited = overrides.get(entryKey(attr, original));
  if (edited === undefined) {
    if (!tracked) return;
    el.setAttribute(attr, original);
    delete attrState.get(el)?.[attr];
    return;
  }
  if (edited === value) return;
  el.setAttribute(attr, edited);
  attrState.set(el, { ...attrState.get(el), [attr]: { original, applied: edited } });
}

export function reconcileTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    reconcileText(root as Text);
    return;
  }
  if (!(root instanceof Element)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) reconcileText(n as Text);
  const withAttrs = [root, ...root.querySelectorAll("[title], [placeholder]")];
  for (const el of withAttrs) for (const attr of ATTR_KINDS) reconcileAttr(el, attr);
}

export function setOverrides(entries: TextEntry[], root: Node) {
  overrides = toOverrides(entries);
  reconcileTree(root);
}

export function observeOverrides(root: Node): () => void {
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(reconcileTree);
      else if (r.type === "characterData") reconcileTree(r.target);
      else if (r.target instanceof Element) {
        const attr = r.attributeName as AttrKind;
        reconcileAttr(r.target, attr);
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTR_KINDS,
  });
  return () => observer.disconnect();
}

function textUnderPoint(target: Element, x: number, y: number): Text | null {
  const range = document.caretRangeFromPoint?.(x, y);
  const hit = range?.startContainer;
  if (hit && hit.nodeType === Node.TEXT_NODE && target.contains(hit)) {
    const box = document.createRange();
    box.selectNodeContents(hit);
    const inside = Array.from(box.getClientRects()).some(
      (r) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2,
    );
    return inside ? (hit as Text) : null;
  }
  const own = Array.from(target.childNodes).filter(
    (n): n is Text => n.nodeType === Node.TEXT_NODE && !!n.nodeValue?.trim(),
  );
  return own.length === 1 ? own[0] : null;
}

export function locateEditable(target: Element, x: number, y: number): Editable | null {
  if (target.closest(`${SKIP}, input, textarea, select, [contenteditable='true']`)) return null;
  const node = textUnderPoint(target, x, y);
  if (node) {
    const value = (node.nodeValue ?? "").trim();
    if (value) {
      return { kind: "text", original: liveTextState(node)?.original ?? value, current: value };
    }
  }
  for (const attr of ATTR_KINDS) {
    const holder = target.closest(`[${attr}]`);
    const value = holder?.getAttribute(attr);
    if (holder && value) {
      return { kind: attr, original: liveAttrState(holder, attr)?.original ?? value, current: value };
    }
  }
  return null;
}
