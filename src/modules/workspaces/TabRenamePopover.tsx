import { type ReactNode, useEffect, useRef } from "react";
import type React from "react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { isImeComposing } from "@/lib/imeEnter";
import { clearTitleDraft, setTitleDraft } from "./lib/titleDraftStore";
import { titleSubjectForTab } from "./lib/titleVariablesFor";
import type { Tab } from "./lib/types";
import { RenameTemplates } from "./RenameTemplates";
import { type RenameOrigin, isRenamingAt, useTabRenameStore } from "./lib/tabRenameStore";

type Props = {
  tabId: string;
  // The tab itself: which variables the templates list offers, and its id is the key of
  // the live title draft while the field is open.
  tab: Tab;
  origin: RenameOrigin;
  title: string | undefined;
  placeholder: string;
  onRenameTab?: (tabId: string, title: string | undefined) => void;
  // Contains the PopoverAnchor the field is positioned against.
  children: ReactNode;
};

const OPEN_GRACE_MS = 300;

// The rename field of a tab, shared by the pane tab and the sidebar row. Both
// mount one; only the one whose origin matches the store opens.
export function TabRenamePopover({ tabId, tab, origin, title, placeholder, onRenameTab, children }: Props) {
  const isRenaming = useTabRenameStore((s) => isRenamingAt(s, tabId, origin));
  const templatesOpen = useTabRenameStore((s) => s.templatesOpen);
  const toggleTemplates = useTabRenameStore((s) => s.toggleTemplates);
  const clearRename = useTabRenameStore((s) => s.clearRename);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const handledRef = useRef(false);
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (!isRenaming) return;
    handledRef.current = false;
    openedAtRef.current = performance.now();
  }, [isRenaming]);

  function handleSave() {
    if (handledRef.current) return;
    handledRef.current = true;
    const next = (inputRef.current?.value ?? "").trim();
    onRenameTab?.(tabId, next || undefined);
    clearRename();
  }

  function handleCancel() {
    if (handledRef.current) return;
    handledRef.current = true;
    clearRename();
  }

  function handleBlur(e: React.FocusEvent) {
    if (popoverRef.current?.contains(e.relatedTarget as Node | null)) return;
    // Right after opening, the context menu closing hands focus back to the terminal
    // of the pane (a deferred requestLeafFocus). That is not the user leaving the
    // field, so take the focus back instead of saving and closing.
    if (performance.now() - openedAtRef.current < OPEN_GRACE_MS) {
      const input = e.currentTarget as HTMLInputElement;
      requestAnimationFrame(() => input.focus());
      return;
    }
    handleSave();
  }

  // The row can unmount with its field open (collapsed list, detail filter,
  // compact bar); without this the store keeps pointing at it forever.
  useEffect(
    () => () => {
      const state = useTabRenameStore.getState();
      if (isRenamingAt(state, tabId, origin)) state.clearRename();
    },
    [tabId, origin],
  );

  // What is being typed shows live in every title of this tab until the field closes;
  // cancelling just drops it. The draft also feeds the template table's {tab}.
  useEffect(() => {
    if (!isRenaming) return;
    return () => clearTitleDraft(tabId);
  }, [isRenaming, tabId]);

  return (
    <Popover
      open={isRenaming}
      onOpenChange={(open) => {
        if (!open) handleSave();
      }}
    >
      {children}
      <PopoverContent
        ref={popoverRef}
        side={origin === "sidebar" ? "right" : "bottom"}
        align={origin === "sidebar" ? "center" : "start"}
        sideOffset={4}
        className={`flex flex-col gap-1 rounded-lg p-2 ${templatesOpen ? "w-[420px]" : "w-64"}`}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          handleCancel();
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <span className="text-[12px] text-muted-foreground">Rename tab</span>
        <input
          ref={inputRef}
          autoFocus
          onFocus={(e) => {
            e.stopPropagation();
            e.currentTarget.select();
          }}
          onBlur={handleBlur}
          defaultValue={title ?? ""}
          onChange={(e) => setTitleDraft(tabId, e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isImeComposing(e.nativeEvent)) {
              e.preventDefault();
              handleSave();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full rounded border border-input bg-transparent px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring placeholder:text-muted-foreground/60"
        />
        <RenameTemplates
          open={templatesOpen}
          onToggle={toggleTemplates}
          subject={titleSubjectForTab(tab.kind)}
          tab={tab}
          getInput={() => inputRef.current}
          onInserted={(value) => setTitleDraft(tabId, value)}
          shortcutId="tab.rename"
        />
      </PopoverContent>
    </Popover>
  );
}
