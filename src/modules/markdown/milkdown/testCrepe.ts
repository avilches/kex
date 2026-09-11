import { Crepe } from "@milkdown/crepe";

export async function createTestCrepe(markdown: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const crepe = new Crepe({ root, defaultValue: markdown });
  await crepe.create();
  return {
    getMarkdown: () => crepe.getMarkdown(),
    destroy: async () => {
      await crepe.destroy();
      root.remove();
    },
  };
}
