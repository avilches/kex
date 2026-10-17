import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, useEffect, useRef, useState } from "react";
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
  { syntax: "{?a|b text}", description: "The text, only when a or b has a value", example: "{dir}{?branch · {branch}}: kex · main, or kex outside a repo" },
  { syntax: "{!a|b text}", description: "The text, only when neither has a value (the else)", example: "{?branch on {branch}}{!branch in {dir}}: on main, or in kex" },
  { syntax: "{{ }}", description: "A literal { or }", example: "{{dir}}: {dir}" },
];

const GROUP_ORDER: TitleVariableGroup[] = ["common", "place", "terminal", "file", "browser", "workspace"];

// Every save writes the file and notifies all windows, so typing is saved in bursts.
const SAVE_DELAY_MS = 250;

function TemplateRow({ kind, pref, label }: (typeof ROWS)[number]) {
  const factory = FACTORY_TITLE_DEFAULTS[kind];
  const stored = usePreferencesStore((s) => s[pref]);
  // The field always holds the template in force, so the default can be edited in place.
  const [value, setValue] = useState(stored || factory);
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const editing = useRef(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The store only echoes a save back after a round trip through disk and the event bus, so
  // what was last written is tracked here, and echoes of older writes are ignored.
  const sent = useRef(stored);
  const inFlight = useRef(0);

  // The saved value arrives after the window loads and other windows can change it; a field
  // being typed in, or one with a write on its way, is never overwritten.
  useEffect(() => {
    if (inFlight.current > 0) return;
    sent.current = stored;
    if (!editing.current) setValue(stored || factory);
  }, [stored, factory]);

  // Empty, or the same as the default: nothing is saved, so the default keeps following Kex.
  const save = (next: string) => {
    const trimmed = next.trim();
    const toStore = trimmed === factory ? "" : trimmed;
    if (toStore === sent.current) return;
    sent.current = toStore;
    inFlight.current += 1;
    void setTitleTemplate(pref, toStore).finally(() => {
      inFlight.current -= 1;
    });
  };

  const flush = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    save(next);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`title-template-${kind}`} className="w-40 shrink-0 text-[12.5px]">
        {label}:
      </label>
      <input
        id={`title-template-${kind}`}
        type="text"
        value={value}
        placeholder={factory}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => {
          setValue(e.target.value);
          pending.current = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, SAVE_DELAY_MS);
        }}
        onBlur={() => {
          editing.current = false;
          const typed = pending.current;
          flush();
          // Nothing typed since the last save: show what is saved, which may have changed
          // elsewhere while the field had focus.
          setValue((typed ?? storedRef.current).trim() || factory);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        spellCheck={false}
        maxLength={500}
        className={INPUT_CLASS}
      />
      <button
        type="button"
        title="Reset to default"
        disabled={value.trim() === factory}
        onClick={() => {
          pending.current = factory;
          setValue(factory);
          flush();
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
    <div id="settings-title-templates" className="flex flex-col gap-2">
      <FieldLabel>Tab and workspace titles</FieldLabel>
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <p className="text-[11px] leading-snug text-muted-foreground">
          What a tab or workspace shows until you rename it. Each field starts with Kex's default: edit it
          and the tabs change as you type. Leave it as it was, or clear it, to keep following the default.
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
