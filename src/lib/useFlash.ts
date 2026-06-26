import { type RefObject, useEffect, useRef } from "react";

// Replays the `terax-flash` CSS animation (defined in styles/globals.css) every
// time `token` changes to a new non-zero value, without remounting the element:
// the class is removed, a reflow is forced, then it is re-added so the animation
// restarts from the first keyframe. Attach the returned ref to the target.
export function useFlash<T extends HTMLElement = HTMLElement>(
  token: number,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!token) return;
    const el = ref.current;
    if (!el) return;
    el.classList.remove("terax-flash");
    void el.offsetWidth; // reflow so the re-added class replays the animation
    el.classList.add("terax-flash");
    const clear = () => el.classList.remove("terax-flash");
    el.addEventListener("animationend", clear, { once: true });
    return () => el.removeEventListener("animationend", clear);
  }, [token]);
  return ref;
}
