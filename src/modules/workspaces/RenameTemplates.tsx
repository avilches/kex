import { Settings01Icon, ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { openTitleTemplatesSettings } from "@/modules/settings/openSettingsWindow";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getOscTitle, subscribe as subscribeOscTitles } from "@/modules/terminal/lib/oscTitleStore";
import {
  getRunningCommand,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import {
  tabDir,
  tabTitleVars,
  type TitleSources,
} from "@/modules/workspaces/lib/titleVars";
import type { Tab } from "@/modules/workspaces/lib/types";
import {
  resolveAgentTabTitle,
  templateNeedsGit,
} from "@/modules/workspaces/lib/useAgentTabTitle";
import type { TitleSubject } from "@/modules/workspaces/lib/titleTemplate";
import {
  insertTitleVariable,
  titleVariablesFor,
  type TitleVariableDoc,
} from "@/modules/workspaces/lib/titleVariablesFor";
import { useDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { useSystemInfo } from "@/modules/workspaces/lib/systemInfoStore";
import { useTabWorkspaceRoot } from "@/modules/workspaces/lib/tabWorkspaceRootStore";
import { useTitleDefaults } from "@/modules/workspaces/lib/titleDefaultsPrefs";

type Props = {
  open: boolean;
  onToggle: () => void;
  // Which tab kind or workspace decides the variable list.
  subject: TitleSubject;
  // The tab the values are resolved against: the renamed tab, or the focused tab of the
  // workspace being renamed.
  tab: Tab | null;
  // Only while renaming a workspace: the folders it falls back to without a focused tab.
  workspace?: { id: string; cwd?: string; workspaceRoot?: string };
  // The rename input, lent so a click on a variable is written into it. Keep the focus
  // in that input while this list is showing: it saves the field on blur.
  getInput: () => HTMLInputElement | null;
  // Syncs whatever the call site keeps beside the DOM input (the live title draft).
  onInserted?: (value: string) => void;
  // The rename shortcut, shown next to the toggle so the same key both opens
  // the field and expands the list. Absent where no shortcut drives the field.
  shortcutId?: ShortcutId;
  // Extra classes for the variables list, to cap its height where the fields below must stay visible.
  listClassName?: string;
};

// The rename field's variable help, replaced by an expandable list: every variable the
// subject can have with the value it holds for this tab right now, each row clickable
// to insert it where the caret is. Styled like the variables table in Settings.
export function RenameTemplates({
  open,
  onToggle,
  subject,
  tab,
  workspace,
  getInput,
  onInserted,
  shortcutId,
  listClassName,
}: Props) {
  const shortcut = useShortcutLabel(shortcutId ?? "tab.rename");
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <HugeiconsIcon icon={open ? ArrowUp01Icon : ArrowDown01Icon} size={12} strokeWidth={2} />
        {open ? "Hide templates" : "Show templates"}
        {shortcutId && shortcut && (
          <span className="ml-auto text-[10px] tabular-nums opacity-60">{shortcut}</span>
        )}
      </button>
      {open && (
        <VariablesList
          subject={subject}
          tab={tab}
          workspace={workspace}
          getInput={getInput}
          onInserted={onInserted}
          className={listClassName}
        />
      )}
      {open && (
        <button
          type="button"
          title="Edit the default titles in Settings"
          aria-label="Edit the default titles in Settings"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            void openTitleTemplatesSettings();
          }}
          className="flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <HugeiconsIcon icon={Settings01Icon} size={12} strokeWidth={2} />
          Defaults
        </button>
      )}
    </>
  );
}

function VariablesList({
  subject,
  tab,
  workspace,
  getInput,
  onInserted,
  className,
}: Omit<Props, "open" | "onToggle" | "shortcutId" | "listClassName"> & { className?: string }) {
  const values = useVariableValues(tab, workspace);
  return (
    <div className={cn("flex min-w-0 flex-col text-[11px] leading-snug", className)}>
      {titleVariablesFor(subject).map((variable) => (
        <VariableRow
          key={variable.name}
          variable={variable}
          value={values[variable.name] ?? ""}
          getInput={getInput}
          onInserted={onInserted}
        />
      ))}
    </div>
  );
}

// Git is asked only when the shown values can name the branch or repo, in the folder the
// values are resolved against.
function useVariableValues(tab: Tab | null, workspace?: Props["workspace"]): Record<string, string> {
  const agentSession = useAgentStore((s) => (tab ? s.sessions[tab.id] : undefined));
  const runningCommand = useSyncExternalStore(
    subscribeToRunningCommands,
    () => (tab?.kind === "terminal" ? getRunningCommand(tab.id) : null),
  );
  const oscTitle = useSyncExternalStore(
    subscribeOscTitles,
    () => (tab?.kind === "terminal" ? getOscTitle(tab.id) : undefined),
  );
  const sys = useSystemInfo();
  const defaults = useTitleDefaults();
  const needsGit = tab !== null || templateNeedsGit(defaults.workspace);
  const dir = tab ? tabDir(tab) : workspace?.cwd || workspace?.workspaceRoot || undefined;
  const git = useDirGit(needsGit ? dir : undefined, tab?.id ?? workspace?.id);
  const tabRoot = useTabWorkspaceRoot(tab?.id);
  const sources: TitleSources = {
    runningCommand,
    git,
    agent: agentSession?.agent,
    osc: oscTitle,
    session: agentSession?.meta?.sessionTitle,
    home: sys.home,
    host: sys.host,
    fallbackDir: dir,
    workspaceRoot: workspace ? workspace.workspaceRoot : tabRoot,
  };
  const vars = tabTitleVars(tab, sources);
  vars.tab = tab
    ? resolveAgentTabTitle(tab, runningCommand, oscTitle, agentSession, sources).displayTitle
    : "";
  return vars;
}

// preventDefault on mousedown keeps the focus (and the caret) in the input that receives
// the insertion, while pointerdown bubbles because the popover counts on it.
function VariableRow({
  variable,
  value,
  getInput,
  onInserted,
}: {
  variable: TitleVariableDoc;
  value: string;
  getInput: Props["getInput"];
  onInserted: Props["onInserted"];
}) {
  return (
    <button
      type="button"
      title={variable.description}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const input = getInput();
        if (!input) return;
        const { value: next } = insertTitleVariable(input, `{${variable.name}}`);
        onInserted?.(next);
      }}
      className="flex w-full min-w-0 items-center gap-2 border-b border-border/30 py-0.5 pr-1 text-left transition-colors last:border-b-0 hover:bg-muted/50"
    >
      <span className="shrink-0 font-mono text-foreground">{`{${variable.name}}`}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{variable.description}</span>
      <span className="max-w-[110px] shrink-0 truncate font-mono text-muted-foreground" title={value}>
        {value}
      </span>
    </button>
  );
}
