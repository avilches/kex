import { type TitleSubject, titleVariableDocs } from "./lib/titleTemplate";

export function TitleVariablesHelp({ subject }: { subject: TitleSubject }) {
  const names = titleVariableDocs(subject).map((v) => `{${v.name}}`);
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      You can use {names.join(" ")}
    </p>
  );
}
