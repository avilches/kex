import type { TabEntry } from "./tabEntries";

export type TabRowDetail = { location: string; branch: string };

// What tells two same-titled tabs apart: the url of a browser tab (protocol stripped), the
// last two folders of the rest.
export function shortLocation(entry: TabEntry): string {
  if (entry.kind === "browser") return entry.detail.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  return entry.detail.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
}

// A non-browser title is built from the folder name ("{dir}"), the last segment of the location,
// so that is what tells whether the title already carries it. A browser title is its own thing:
// only a title that spells the whole url hides it.
function carriesLocation(entry: TabEntry, location: string): boolean {
  if (!entry.title) return false;
  if (entry.kind === "browser") return entry.title.includes(location);
  const folder = location.split(/[\\/]/).filter(Boolean).pop() ?? "";
  return !!folder && entry.title.includes(folder);
}

// The second line of a tab row: only the parts the title does not already carry, so a default
// title like "Kex · main" keeps its row one line tall. An ambiguous title always shows the
// locator, because the title alone cannot tell the two tabs apart. Null when there is nothing
// left to add.
export function tabRowDetail(entry: TabEntry, ambiguous: boolean): TabRowDetail | null {
  const location = shortLocation(entry);
  const showLocation = !!location && (ambiguous || !carriesLocation(entry, location));
  const showBranch = !!entry.branch && !entry.title.includes(entry.branch);
  if (!showLocation && !showBranch) return null;
  return {
    location: showLocation ? location : "",
    branch: showBranch ? entry.branch : "",
  };
}
