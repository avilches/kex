import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowControls } from "@/components/WindowControls";
import { cn } from "@/lib/utils";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import type { SettingsSection } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  Cancel01Icon,
  ColorsIcon,
  ComputerTerminal01Icon,
  DocumentCodeIcon,
  File02Icon,
  InformationCircleIcon,
  KeyboardIcon,
  Layers01Icon,
  PaintBoardIcon,
  Settings01Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { type JSX, useEffect, useRef, useState } from "react";
import { DuplicateQuitModal } from "@/modules/explorer/DuplicateQuitModal";
import { initDuplicateProgressListener } from "@/modules/explorer/lib/duplicateStore";
import { AboutSection } from "./sections/AboutSection";
import { ExternalEditorsSection } from "./sections/ExternalEditorsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { EditorSection } from "./sections/EditorSection";
import { FileTypesSection } from "./sections/FileTypesSection";
import { GeneralSection } from "./sections/GeneralSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { TerminalSection } from "./sections/TerminalSection";
import { ThemesSection } from "./sections/ThemesSection";
import { WorkspacesSection } from "./sections/WorkspacesSection";

const SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: typeof Settings01Icon;
  component: () => JSX.Element;
}[] = [
  { id: "general", label: "General", icon: Settings01Icon, component: GeneralSection },
  { id: "workspaces", label: "Workspaces", icon: Layers01Icon, component: WorkspacesSection },
  { id: "terminal", label: "Terminal", icon: ComputerTerminal01Icon, component: TerminalSection },
  { id: "editor", label: "Editor", icon: SourceCodeIcon, component: EditorSection },
  { id: "filetypes", label: "File Types", icon: File02Icon, component: FileTypesSection },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon, component: AppearanceSection },
  { id: "themes", label: "Themes", icon: ColorsIcon, component: ThemesSection },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon, component: ShortcutsSection },
  { id: "external-editors", label: "Tools", icon: DocumentCodeIcon, component: ExternalEditorsSection },
  { id: "about", label: "About", icon: InformationCircleIcon, component: AboutSection },
];

const VALID_SECTIONS: SettingsSection[] = SECTIONS.map((s) => s.id);

function parseSectionParam(raw: string | null): { section: SettingsSection; ext?: string } {
  if (!raw) return { section: "general" };
  const [sectionId, ext] = raw.split(":");
  const section = (VALID_SECTIONS as string[]).includes(sectionId) ? (sectionId as SettingsSection) : "general";
  return { section, ext: ext || undefined };
}

function readInitialSection(): SettingsSection {
  if (typeof window === "undefined") return "general";
  const url = new URL(window.location.href);
  return parseSectionParam(url.searchParams.get("section")).section;
}

function readInitialFileTypesExt(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const url = new URL(window.location.href);
  return parseSectionParam(url.searchParams.get("section")).ext;
}

export function SettingsApp() {
  const [active, setActive] = useState<SettingsSection>(readInitialSection);
  const [fileTypesExt, setFileTypesExt] = useState<string | undefined>(readInitialFileTypesExt);
  const init = usePreferencesStore((s) => s.init);
  const ActiveSection = SECTIONS.find((s) => s.id === active)?.component;
  // Track whether fileTypesExt has been consumed by EditorSection so we don't re-apply on re-render.
  const fileTypesExtConsumed = useRef(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    initDuplicateProgressListener();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void getCurrentWebviewWindow().close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const apply = (raw: string) => {
      const { section, ext } = parseSectionParam(raw);
      setActive(section);
      if (ext) {
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
              ) : (
                ActiveSection && <ActiveSection />
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      <DuplicateQuitModal />
    </div>
  );
}
