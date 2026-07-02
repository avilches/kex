import { useEffect } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";

function applyToDom(font: string): void {
  document.documentElement.style.fontFamily = font.trim()
    ? `${font.trim()}, sans-serif`
    : "";
}

export function useUiFont() {
  const uiFont = usePreferencesStore((s) => s.uiFont);
  const hydrated = usePreferencesStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    applyToDom(uiFont);
  }, [hydrated, uiFont]);
}
