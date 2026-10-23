import { search, SearchQuery, setSearchQuery } from "@codemirror/search";
import { EditorSelection, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type ViewSearchHandle = {
  setQuery: (q: string) => void;
  findNext: (q: string) => void;
  findPrevious: (q: string) => void;
  clearQuery: () => void;
};

const prepared = new WeakSet<EditorView>();

// The search state field only exists once the extension is installed, and
// the stock findNext/findPrevious commands open the native panel whenever the
// query is missing or invalid, so matches are moved here instead.
function ensureSearch(view: EditorView) {
  if (prepared.has(view)) return;
  prepared.add(view);
  view.dispatch({ effects: StateEffect.appendConfig.of(search()) });
}

function applyQuery(view: EditorView, q: string) {
  ensureSearch(view);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ search: q, caseSensitive: false }),
    ),
  });
}

type Range = { from: number; to: number };

function firstMatch(
  query: SearchQuery,
  view: EditorView,
  from: number,
  to: number,
): Range | null {
  const next = query.getCursor(view.state, from, to).next();
  return next.done ? null : next.value;
}

function lastMatch(
  query: SearchQuery,
  view: EditorView,
  from: number,
  to: number,
): Range | null {
  let last: Range | null = null;
  const cursor = query.getCursor(view.state, from, to);
  for (let n = cursor.next(); !n.done; n = cursor.next()) last = n.value;
  return last;
}

function goToMatch(view: EditorView, q: string, forward: boolean) {
  if (!q) return;
  applyQuery(view, q);
  const query = new SearchQuery({ search: q, caseSensitive: false });
  const { from, to } = view.state.selection.main;
  const match = forward
    ? firstMatch(query, view, to, view.state.doc.length) ??
      firstMatch(query, view, 0, to)
    : lastMatch(query, view, 0, from) ??
      lastMatch(query, view, from, view.state.doc.length);
  if (!match) return;
  view.dispatch({
    selection: EditorSelection.single(match.from, match.to),
    effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    userEvent: "select.search",
  });
}

export function viewSearchHandle(
  getView: () => EditorView | null | undefined,
): ViewSearchHandle {
  return {
    setQuery: (q) => {
      const v = getView();
      if (!v) return;
      if (q) goToMatch(v, q, true);
      else applyQuery(v, "");
    },
    findNext: (q) => {
      const v = getView();
      if (v) goToMatch(v, q, true);
    },
    findPrevious: (q) => {
      const v = getView();
      if (v) goToMatch(v, q, false);
    },
    clearQuery: () => {
      const v = getView();
      if (v) applyQuery(v, "");
    },
  };
}
