// Whether a reload should replace the in-memory buffer with disk content.
// force=true is how "Reload from disk" resolves a conflict by discarding
// local edits; otherwise a dirty buffer is left untouched so a conflict
// overlay can ask the user first. A reload must still be attempted either
// way, since detecting the file was deleted (or erroring) doesn't depend on
// whether its content would be applied.
export function shouldApplyReload(force: boolean, dirty: boolean): boolean {
  return force || !dirty;
}
