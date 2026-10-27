import { ENTER_KEY } from "@/lib/platform";

// A bare Enter is listened for at the window, so it may only wake the tab when nothing else would
// take the key: not a field, a button, a menu, the editor, the explorer, a dialog. The terminal's
// own input is the one exception, because the placeholder shows where a terminal would be.
const ENTER_OWNERS = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable]",
  "[role=button]",
  "[role=menu]",
  "[role=menuitem]",
  "[role=listbox]",
  "[role=option]",
  "[role=tree]",
  "[role=treeitem]",
  "[role=dialog]",
  "[role=alertdialog]",
  ".cm-editor",
  "[data-scm-panel]",
].join(",");

const SPELLED: Record<string, string> = { "⌘": "Cmd", "⌥": "Alt", "⌃": "Ctrl", "⇧": "Shift", [ENTER_KEY]: "Enter" };

// The placeholder names the keys in words ("Cmd+Alt+Z"), where menus use the macOS glyphs.
export function spellBinding(tokens: readonly string[]): string {
  return tokens.map((t) => SPELLED[t] ?? t).join("+");
}

export function restoreHint(bindings: readonly (readonly string[])[]): string | null {
  const spelled = bindings.filter((tokens) => tokens.length > 0).map(spellBinding);
  return spelled.length > 0 ? `Press ${spelled.join(" or ")} to restore` : null;
}

export function enterBelongsToFocusedElement(target: Element | null): boolean {
  if (!target) return false;
  if (target.matches(".xterm-helper-textarea")) return false;
  return target.closest(ENTER_OWNERS) !== null;
}
