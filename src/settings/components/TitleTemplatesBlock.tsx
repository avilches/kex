import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTitleTemplate, type TitleTemplatePref } from "@/modules/settings/store";
import { FACTORY_TITLE_DEFAULTS, type TitleDefaultKind } from "@/modules/workspaces/lib/defaultTitles";
import { TITLE_VARIABLE_DOCS } from "@/modules/workspaces/lib/titleTemplate";
import { FieldLabel } from "./FieldLabel";
import { INPUT_CLASS } from "./inputClass";

const ROWS: { kind: TitleDefaultKind; pref: TitleTemplatePref; label: string }[] = [
  { kind: "terminal", pref: "titleTemplateTerminal", label: "Terminal" },
  { kind: "agent", pref: "titleTemplateAgent", label: "Terminal with an agent" },
  { kind: "file", pref: "titleTemplateFile", label: "Editor, markdown, diffs" },
  { kind: "browser", pref: "titleTemplateBrowser", label: "Browser" },
  { kind: "gitHistory", pref: "titleTemplateGitHistory", label: "Git History" },
  { kind: "workspace", pref: "titleTemplateWorkspace", label: "Workspace" },
];

const SYNTAX_DOCS: { syntax: string; description: string }[] = [
  { syntax: "{a|b|c}", description: "The first value that is not empty" },
  { syntax: "{?var text}", description: "The text, only when var has a value (text may hold more {variables})" },
  { syntax: "{{ }}", description: "A literal { or }" },
];

function TemplateRow({ kind, pref, label }: (typeof ROWS)[number]) {
  const stored = usePreferencesStore((s) => s[pref]);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const [value, setValue] = useState(stored);

  // Preferences hydrate asynchronously; resync once the saved value is in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a hydration or an external change should overwrite the draft
  useEffect(() => {
    setValue(stored);
  }, [hydrated, stored]);

  const commit = (next: string) => {
    const trimmed = next.trim();
    setValue(trimmed);
    if (trimmed !== stored) void setTitleTemplate(pref, trimmed);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`title-template-${kind}`} className="w-40 shrink-0 text-[12.5px]">
        {label}:
      </label>
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
      <button
        type="button"
        title="Reset to default"
        disabled={!stored && !value}
        onClick={() => {
          setValue("");
          void setTitleTemplate(pref, "");
        }}
        className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <HugeiconsIcon icon={Refresh01Icon} size={11} />
      </button>
    </div>
  );
}

function HelpTable() {
  const rows = [
    ...TITLE_VARIABLE_DOCS.map((v) => ({
      syntax: `{${v.name}}`,
      description: v.scope === "workspace" ? `${v.description} (workspaces only)` : v.description,
    })),
    ...SYNTAX_DOCS,
  ];
  return (
    <table className="w-full border-collapse text-[11px] leading-snug">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="w-32 border-b border-border/60 py-1 pr-2 font-medium">Syntax</th>
          <th className="border-b border-border/60 py-1 font-medium">What it shows</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.syntax}>
            <td className="border-b border-border/30 py-0.5 pr-2 font-mono text-foreground">{r.syntax}</td>
            <td className="border-b border-border/30 py-0.5 text-muted-foreground">{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TitleTemplatesBlock() {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Tab and workspace titles</FieldLabel>
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <p className="text-[11px] leading-snug text-muted-foreground">
          What a tab or workspace shows until you rename it. An empty field uses the default shown in it.
        </p>
        {ROWS.map((row) => (
          <TemplateRow key={row.kind} {...row} />
        ))}
        <div className="mt-1">
          <HelpTable />
        </div>
      </div>
    </div>
  );
}
