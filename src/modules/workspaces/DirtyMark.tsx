// The blue dot of a file tab with unsaved changes, right after its name wherever the name is drawn.
export function DirtyMark() {
  return (
    <span role="img" aria-label="Unsaved changes" data-dirty-mark="" className="shrink-0 text-[9px] text-primary">
      ●
    </span>
  );
}
