import Image from "@tiptap/extension-image";

export const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: "full",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-size") || "full",
        renderHTML: (attributes: Record<string, unknown>) => {
          return { "data-size": attributes.size };
        },
      },
    };
  },
});
