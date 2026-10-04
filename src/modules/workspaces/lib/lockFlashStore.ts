import { createFlashStore } from "./createFlashStore";

const store = createFlashStore();

export const flashLockIcon = store.flash;
export const subscribeLockFlash = store.subscribe;
export const getLockFlashSnapshot = store.getSnapshot;
