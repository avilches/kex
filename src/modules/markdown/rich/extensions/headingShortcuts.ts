import { Extension } from "@tiptap/core";
// Type-only: pulls in the toggleHeading/setParagraph command augmentations (no runtime code).
import type {} from "@tiptap/extension-heading";
import type {} from "@tiptap/extension-paragraph";

export const HeadingShortcuts = Extension.create({
  name: "headingShortcuts",
  addKeyboardShortcuts() {
    const toggle = (level: 1 | 2 | 3 | 4 | 5 | 6) => () => this.editor.chain().focus().toggleHeading({ level }).run();
    return {
      "Mod-1": toggle(1),
      "Mod-2": toggle(2),
      "Mod-3": toggle(3),
      "Mod-4": toggle(4),
      "Mod-5": toggle(5),
      "Mod-6": toggle(6),
      "Mod-0": () => this.editor.chain().focus().setParagraph().run(),
    };
  },
});
