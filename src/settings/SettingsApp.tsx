import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowControls } from "@/components/WindowControls";
import { cn } from "@/lib/utils";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import type { SettingsSection } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { SETTINGS_SECTIONS } from "@/modules/settings/sections";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { type JSX, createElement, useEffect, useRef, useState } from "react";
import { DuplicateQuitModal } from "@/modules/explorer/DuplicateQuitModal";
import { initDuplicateProgressListener } from "@/modules/explorer/lib/duplicateStore";
import { AboutSection } from "./sections/AboutSection";
import { ActionsSection } from "./sections/ActionsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { EditorSection } from "./sections/EditorSection";
import { FileTypesSection } from "./sections/FileTypesSection";
import { GeneralSection } from "./sections/GeneralSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { TerminalSection } from "./sections/TerminalSection";
import { ThemesSection } from "./sections/ThemesSection";
import { WorkspacesSection } from "./sections/WorkspacesSection";

const COMPONENTS: Record<SettingsSection, (props: never) => JSX.Element> = {
  general: GeneralSection,
  workspaces: WorkspacesSection,
  terminal: TerminalSection,
  actions: ActionsSection,
  editor: EditorSection,
  filetypes: FileTypesSection,
  appearance: AppearanceSection,
  themes: ThemesSection,
  shortcuts: ShortcutsSection,
  about: AboutSection,
};

const SECTIONS = SETTINGS_SECTIONS.map((s) => ({ ...s, component: COMPONENTS[s.id] }));

const VALID_SECTIONS: SettingsSection[] = SECTIONS.map((s) => s.id);

export function parseSectionParam(raw: string | null): { section: SettingsSection; ext?: string } {
  if (!raw) return { section: "general" };
  const [sectionId, ...rest] = raw.split(":");
  const section = (VALID_SECTIONS as string[]).includes(sectionId) ? (sectionId as SettingsSection) : "general";
  return { section, ext: rest.length > 0 ? rest.join(":") : undefined };
}

// Blocks a section can be asked to scroll to ("appearance:titles").
const ANCHOR_IDS: Record<string, string> = { titles: "settings-title-templates" };

function readInitialAnchor(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const { section, ext } = parseSectionParam(new URL(window.location.href).searchParams.get("section"));
  return section === "appearance" ? ext : undefined;
}

function readInitialSection(): SettingsSection {
  if (typeof window === "undefined") return "general";
  const url = new URL(window.location.href);
  return parseSectionParam(url.searchParams.get("section")).section;
}

function readInitialFileTypesExt(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const url = new URL(window.location.href);
  const { section, ext } = parseSectionParam(url.searchParams.get("section"));
  return section === "filetypes" ? ext : undefined;
}

export function SettingsApp() {
  const [active, setActive] = useState<SettingsSection>(readInitialSection);
  const [fileTypesExt, setFileTypesExt] = useState<string | undefined>(readInitialFileTypesExt);
  const init = usePreferencesStore((s) => s.init);
  const ActiveSection = SECTIONS.find((s) => s.id === active)?.component;
  // Track whether fileTypesExt has been consumed by EditorSection so we don't re-apply on re-render.
  const fileTypesExtConsumed = useRef(false);
  const [anchor, setAnchor] = useState<string | undefined>(readInitialAnchor);

  useEffect(() => {
    if (!anchor) return;
    const frame = requestAnimationFrame(() => {
      const id = ANCHOR_IDS[anchor];
      if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
      setAnchor(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor, active]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    initDuplicateProgressListener();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Let an open dialog/popover consume Escape first (Radix closes it), and
      // never close the window out from under a field being edited.
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      void getCurrentWebviewWindow().close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const apply = (raw: string) => {
      const { section, ext } = parseSectionParam(raw);
      setActive(section);
      setAnchor(section === "appearance" ? ext : undefined);
      if (ext && section === "filetypes") {
        fileTypesExtConsumed.current = false;
        setFileTypesExt(ext);
      }
    };
    const unlistenPromise = getCurrentWebviewWindow().listen<string>(
      "kex:settings-section",
      (e) => apply(e.payload),
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground select-none">
      <aside className="flex w-48 shrink-0 flex-col border-r border-border/60 bg-card/40">
        <div
          data-tauri-drag-region
          className={`shrink-0 ${IS_MAC ? "h-11" : "h-3"}`}
        />
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          {SECTIONS.map((s) => {
            const isActive = s.id === active;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <HugeiconsIcon icon={s.icon} size={14} strokeWidth={1.75} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {USE_CUSTOM_WINDOW_CONTROLS ? (
          <header
            data-tauri-drag-region
            className="relative flex h-11 shrink-0 items-center justify-end border-b border-border/60 bg-card/60 px-3"
          >
            <WindowControls closeOnly />
          </header>
        ) : (
          <div
            data-tauri-drag-region
            className="relative flex h-9 shrink-0 items-center justify-end px-2"
          >
            <button
              type="button"
              title="Close"
              aria-label="Close settings"
              onClick={() => void getCurrentWebviewWindow().close()}
              className="flex size-7 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
            </button>
          </div>
        )}

        <ScrollArea type="auto" className="min-h-0 flex-1">
          <div className="px-8 pt-2 pb-7">
            <div className="mx-auto w-full max-w-160">
              {active === "filetypes" ? (
                <FileTypesSection
                  focusExt={fileTypesExtConsumed.current ? undefined : fileTypesExt}
                  onFocusConsumed={() => {
                    fileTypesExtConsumed.current = true;
                    setFileTypesExt(undefined);
                  }}
                />
              ) : active === "actions" ? (
                <ActionsSection />
              ) : (
                ActiveSection && createElement(ActiveSection)
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      <DuplicateQuitModal />
    </div>
  );
}
