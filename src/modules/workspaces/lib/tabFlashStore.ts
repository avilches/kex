import { createFlashStore } from "./createFlashStore";

const store = createFlashStore();

export const flashTab = store.flash;
export const subscribeTabFlash = store.subscribe;
export const getTabFlashSnapshot = store.getSnapshot;
export const useTabFlash = store.useFlash;
