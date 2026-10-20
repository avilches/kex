// What choosing a row does, said before the row title so a folder, a tab and an action do not
// read the same. Folder and File are the closed reentry rows.
export type RowTagKind = "Tab" | "Workspace" | "Action" | "Setting" | "Folder" | "File";

export function RowTag({ kind }: { kind: RowTagKind }) {
  return (
    <span className="w-16 shrink-0 text-center text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
      {kind}
    </span>
  );
}
