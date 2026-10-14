import { type TitleScope, titleVariableDocs } from "./lib/titleTemplate";

type Props = {
  scope: TitleScope;
  // "chips" is a compact wrapped row for small popovers; "list" adds each description.
  layout?: "chips" | "list";
};

export function TitleVariablesHelp({ scope, layout = "chips" }: Props) {
  const docs = titleVariableDocs(scope);
  return (
    <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      <span>
        Variables update as you work. Use <code className="font-mono">{"{{"}</code> and{" "}
        <code className="font-mono">{"}}"}</code> for literal braces.
      </span>
      {layout === "chips" ? (
        <div className="flex flex-wrap gap-1">
          {docs.map((v) => (
            <code
              key={v.name}
              title={v.description}
              className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-foreground"
            >
              {`{${v.name}}`}
            </code>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {docs.map((v) => (
            <div key={v.name} className="contents">
              <dt>
                <code className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-foreground">
                  {`{${v.name}}`}
                </code>
              </dt>
              <dd>{v.description}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
