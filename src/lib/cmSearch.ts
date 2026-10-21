import {
  findNext,
  findPrevious,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorView } from "@codemirror/view";

export type ViewSearchHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
};

export function viewSearchHandle(
  getView: () => EditorView | null | undefined,
): ViewSearchHandle {
  return {
    setQuery: (q) => {
      const v = getView();
      if (!v) return;
      v.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({ search: q, caseSensitive: false }),
        ),
      });
      if (q) findNext(v);
    },
    findNext: () => {
      const v = getView();
      if (v) findNext(v);
    },
    findPrevious: () => {
      const v = getView();
      if (v) findPrevious(v);
    },
    clearQuery: () => {
      const v = getView();
      if (!v) return;
      v.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: "" })),
      });
    },
  };
}
