import { ENTER_KEY, fmtShortcut, SHIFT_KEY } from "@/lib/platform";

type SendKeys = { enter: string; shiftEnter: string };

const PLATFORM_KEYS: SendKeys = {
  enter: ENTER_KEY,
  shiftEnter: fmtShortcut(SHIFT_KEY, ENTER_KEY),
};

export function sendPlaceholder(
  enterSends: boolean,
  keys: SendKeys = PLATFORM_KEYS,
): string {
  return enterSends
    ? `${keys.enter} sends. ${keys.shiftEnter} new line`
    : `${keys.shiftEnter} sends. ${keys.enter} new line`;
}
