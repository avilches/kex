import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

function cellColorAttributes() {
  return {
    backgroundColor: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-bg-color") || element.style.backgroundColor || null,
      renderHTML: (attributes: Record<string, unknown>) => {
        if (!attributes.backgroundColor) return {};
        const bg = attributes.backgroundColor as string;
        // Determine if we need light text for dark backgrounds
        const darkBgs = ["#1e293b", "#374151", "#7f1d1d", "#713f12", "#14532d", "#1e3a5f", "#4c1d95", "#831843", "#0c4a6e", "#064e3b"];
        const needsLight = darkBgs.includes(bg);
        const style = needsLight ? `background-color: ${bg}; color: #f1f5f9` : `background-color: ${bg}`;
        return { style, "data-bg-color": bg };
      },
    },
  };
}

export const RichTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellColorAttributes() };
  },
});

export const RichTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellColorAttributes() };
  },
});
