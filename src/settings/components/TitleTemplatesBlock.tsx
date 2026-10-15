import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, useEffect, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTitleTemplate, type TitleTemplatePref } from "@/modules/settings/store";
import { FACTORY_TITLE_DEFAULTS, type TitleDefaultKind } from "@/modules/workspaces/lib/defaultTitles";
import {
  TITLE_GROUP_LABELS,
  TITLE_VARIABLE_DOCS,
  type TitleVariableGroup,
} from "@/modules/workspaces/lib/titleTemplate";
import { FieldLabel } from "./FieldLabel";
import { INPUT_CLASS } from "./inputClass";

const ROWS: { kind: TitleDefaultKind; pref: TitleTemplatePref; label: string }[] = [
  { kind: "terminal", pref: "titleTemplateTerminal", label: "Terminal" },
  { kind: "agent", pref: "titleTemplateAgent", label: "Terminal with an agent" },
  { kind: "gitHistory", pref: "titleTemplateGitHistory", label: "Git History" },
  { kind: "browser", pref: "titleTemplateBrowser", label: "Browser" },
  { kind: "diff", pref: "titleTemplateDiff", label: "Diff" },
  { kind: "editor", pref: "titleTemplateEditor", label: "Editor" },
  { kind: "workspace", pref: "titleTemplateWorkspace", label: "Workspace" },
];

const SYNTAX_DOCS: { syntax: string; description: string; example: string }[] = [
  { syntax: "{a|b|c}", description: "The first value that is not empty", example: "{cmd|cwd}: npm run dev, or ~/code/kex when idle" },
  { syntax: "{?var text}", description: "The text, only when var has a value", example: "{dir}{?branch · {branch}}: kex · main, or kex outside a repo" },
  { syntax: "{{ }}", description: "A literal { or }", example: "{{dir}}: {dir}" },
];

const GROUP_ORDER: TitleVariableGroup[] = ["common", "terminal", "file", "browser", "workspace"];

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
  return (
    <table className="w-full border-collapse text-[11px] leading-snug">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="w-24 border-b border-border/60 py-1 pr-2 font-medium">Variable</th>
          <th className="border-b border-border/60 py-1 pr-2 font-medium">What it shows</th>
          <th className="border-b border-border/60 py-1 font-medium">Example</th>
        </tr>
      </thead>
      <tbody>
        {GROUP_ORDER.map((group) => (
          <Fragment key={group}>
            <tr>
              <th colSpan={3} className="pb-0.5 pt-2 text-left font-medium text-foreground">
                {TITLE_GROUP_LABELS[group]}
              </th>
            </tr>
            {TITLE_VARIABLE_DOCS.filter((v) => v.group === group).map((v) => (
              <tr key={v.name}>
                <td className="border-b border-border/30 py-0.5 pr-2 font-mono text-foreground">{`{${v.name}}`}</td>
                <td className="border-b border-border/30 py-0.5 pr-2 text-muted-foreground">{v.description}</td>
                <td className="border-b border-border/30 py-0.5 font-mono text-muted-foreground">{v.example}</td>
              </tr>
            ))}
          </Fragment>
        ))}
        <tr>
          <th colSpan={3} className="pb-0.5 pt-2 text-left font-medium text-foreground">
            Combining them
          </th>
        </tr>
        {SYNTAX_DOCS.map((r) => (
          <tr key={r.syntax}>
            <td className="border-b border-border/30 py-0.5 pr-2 font-mono text-foreground">{r.syntax}</td>
            <td className="border-b border-border/30 py-0.5 pr-2 text-muted-foreground">{r.description}</td>
            <td className="border-b border-border/30 py-0.5 font-mono text-muted-foreground">{r.example}</td>
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
          A workspace takes the values of the tab you are on.
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
