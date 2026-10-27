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

export function enterBelongsToFocusedElement(target: Element | null): boolean {
  if (!target) return false;
  if (target.matches(".xterm-helper-textarea")) return false;
  return target.closest(ENTER_OWNERS) !== null;
}
