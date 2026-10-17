export function domFocusHoldsOsRefocus(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.classList.contains("xterm-helper-textarea")) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable
  );
}
