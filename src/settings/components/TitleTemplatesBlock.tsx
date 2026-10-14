import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTitleTemplate, type TitleTemplatePref } from "@/modules/settings/store";
import { FACTORY_TITLE_DEFAULTS, type TitleDefaultKind } from "@/modules/workspaces/lib/defaultTitles";
import { type TitleScope, TITLE_SYNTAX_HINT } from "@/modules/workspaces/lib/titleTemplate";
import { TitleVariablesHelp } from "@/modules/workspaces/TitleVariablesHelp";
import { FieldLabel } from "./FieldLabel";
import { INPUT_CLASS } from "./inputClass";

const ROWS: {
  kind: TitleDefaultKind;
  pref: TitleTemplatePref;
  label: string;
  scope: TitleScope;
}[] = [
  { kind: "terminal", pref: "titleTemplateTerminal", label: "Terminal tab", scope: "tab" },
  { kind: "agent", pref: "titleTemplateAgent", label: "Terminal tab with a coding agent", scope: "tab" },
  { kind: "file", pref: "titleTemplateFile", label: "Editor, markdown and diff tabs", scope: "tab" },
  { kind: "browser", pref: "titleTemplateBrowser", label: "Browser tab", scope: "tab" },
  { kind: "gitHistory", pref: "titleTemplateGitHistory", label: "Git History tab", scope: "tab" },
  { kind: "workspace", pref: "titleTemplateWorkspace", label: "Workspace", scope: "workspace" },
];

function TemplateRow({ kind, pref, label, scope }: (typeof ROWS)[number]) {
  const stored = usePreferencesStore((s) => s[pref]);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const [value, setValue] = useState(stored);

  // Preferences hydrate asynchronously; resync once the saved value is in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a hydration or an external change should overwrite the draft
  useEffect(() => {
    setValue(stored);
  }, [hydrated, stored]);

  const commit = (next: string) => {
    if (next.trim() !== stored) void setTitleTemplate(pref, next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`title-template-${kind}`} className="text-[12.5px] font-medium">
          {label}
        </label>
        <button
          type="button"
          title="Reset to default"
          disabled={!stored}
          onClick={() => {
            setValue("");
            void setTitleTemplate(pref, "");
          }}
          className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={11} />
        </button>
      </div>
      <input
        id={`title-template-${kind}`}
        type="text"
        value={value}
        placeholder={FACTORY_TITLE_DEFAULTS[kind]}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        spellCheck={false}
        className={INPUT_CLASS}
      />
      <TitleVariablesHelp scope={scope} />
    </div>
  );
}

export function TitleTemplatesBlock() {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Tab and workspace titles</FieldLabel>
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <p className="text-[11px] leading-snug text-muted-foreground">
          What a tab or workspace shows when you have not renamed it. Leave a field empty to use the
          default shown in it. {TITLE_SYNTAX_HINT}
        </p>
        {ROWS.map((row) => (
          <TemplateRow key={row.kind} {...row} />
        ))}
      </div>
    </div>
  );
}
