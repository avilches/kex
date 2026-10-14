import { type TitleScope, titleVariableDocs } from "./lib/titleTemplate";

export function TitleVariablesHelp({ scope }: { scope: TitleScope }) {
  const names = titleVariableDocs(scope).map((v) => `{${v.name}}`);
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      You can use: {names.join(" ")}
    </p>
  );
}
