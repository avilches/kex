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
  "[data-file-explorer]",
].join(",");

export function enterBelongsToFocusedElement(target: Element | null): boolean {
  if (!target) return false;
  if (target.matches(".xterm-helper-textarea")) return false;
  return target.closest(ENTER_OWNERS) !== null;
}

// The bare Enter that wakes the placeholder: no modifier, not a key repeat, and nothing else took it.
export function isWakeEnter(e: KeyboardEvent): boolean {
  if (e.key !== "Enter" || e.repeat || e.defaultPrevented) return false;
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return false;
  return !enterBelongsToFocusedElement(e.target as Element | null);
}
